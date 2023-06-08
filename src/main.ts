import {ConfigFormBuilder, ContextActionsBuilder, Devvit, KeyValueStorage, RedditAPIClient, getSetting, getSettings} from '@devvit/public-api';

import {CommentSubmit, ContextType, Metadata, PostSubmit, RedditObject, CommentReport, PostReport} from '@devvit/protos';
import {
    Activity,
    CompareOptions,
    CreateModNoteOpts, DEFAULT_COM_THRESHOLD, DEFAULT_COM_REMOVE_TRIGGER,
    DEFAULT_IGNORE_AUTOMOD,
    DEFAULT_IGNORE_MODS, DEFAULT_SUB_THRESHOLD, DEFAULT_SUB_REMOVE_TRIGGER,
    DEFAULT_THRESHOLD,
    RepeatCheckResult, DEFAULT_COM_MODNOTE_TRIGGER, DEFAULT_SUB_MODNOTE_TRIGGER, DEFAULT_KEEP_REMOVED
} from "./Atomic.js";
import {
    authorIsModFromContext, authorNameFromContext,
    condenseActivities,
    extractApplicableGroupedActivities,
    generateResult,
    getUserInputValue
} from "./funcs.js";
import {parseRedditFullname} from "@foxxmd/common-libs/functions";
import {PASS} from "@foxxmd/common-libs/atomic";
import {settings} from "./settings.js";

const reddit = new RedditAPIClient();
const kv = new KeyValueStorage();

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 1,
    matchScore: 85,
    useProcessingAsReference: true,
    threshold: `>= ${DEFAULT_THRESHOLD}`,
    keepRemoved: DEFAULT_KEEP_REMOVED
}

Devvit.addSettings(settings);

Devvit.ContextAction.onGetActions(async (_event, metadata) => {

    const defaultThreshold = await getSetting<number>('defaultThreshold',metadata);
    const defaultRemove = await getSetting<boolean>('defaultRemove',metadata);
    const defaultModnote = await getSetting<boolean>('defaultModnote',metadata);
    const defaultCountRemoved = await getSetting<boolean>('defaultCountRemoved', metadata);

    return new ContextActionsBuilder()
        .action({
            actionId: 'checkRepeat',
            name: `Check If Activity is Repeated`,
            description: `Detect if the content of the current Activity is repeated in Author's recent history`,
            post: true,
            comment: true,
            moderator: true,
            userInput: new ConfigFormBuilder()
                .numberField('threshold', 'Trigger if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                .booleanField('countRemoved', 'Count already removed Activities?', defaultCountRemoved ?? DEFAULT_KEEP_REMOVED)
                .booleanField('remove', 'Remove if Threshold Met?', defaultRemove ?? false)
                .booleanField('modnote', 'Add Modnote if Threshold Met?', defaultModnote ?? false)
                .build()
        })
        // TODO enable once unmoderated/modqueue endpoints are supported
        /*        .action({
                    actionId: 'checkRepeatModqueue',
                    name: `Check for Repeated Activities in Modqueue`,
                    description: 'Run Repeated Activity check for all Activities in Modqueue',
                    subreddit: true,
                    userInput: new ConfigFormBuilder()
                        .numberField('threshold', 'Check if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                        .booleanField('remove', 'Remove if Threshold Met?', defaultRemove)
                        .booleanField('modnote', 'Modnote if Threshold Met?', defaultModnote)
                        .build()
                })
                .action({
                    actionId: 'checkRepeatUnmoderated',
                    name: `Check for Repeated Activities in Unmoderated`,
                    description: 'Run Repeated Activity check for all Activities in Unmoderated queue',
                    subreddit: true,
                    userInput: new ConfigFormBuilder()
                        .numberField('threshold', 'Check if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                        .booleanField('remove', 'Remove if Threshold Met?', defaultRemove)
                        .booleanField('modnote', 'Modnote if Threshold Met?', defaultModnote)
                        .build()
                })*/
        .build();
});

Devvit.ContextAction.onAction(async (action, metadata?: Metadata) => {

    // TODO .subreddit was available but no longer on prod? Would be better to use name rather than Id
    let subredditIdentifier: string | undefined = undefined;
    if (action.context === ContextType.POST) {
        subredditIdentifier = (action.post as RedditObject).subredditId as string;
    } else if (action.context === ContextType.COMMENT) {
        subredditIdentifier = (action.comment as RedditObject).subredditId as string;
    } else if (action.context === ContextType.SUBREDDIT) {
        subredditIdentifier = (action.subreddit?.id) as string;
    }
    if (subredditIdentifier === undefined) {
        return {success: false, message: 'Could not determine subreddit?'};
    }

    const defaultThreshold: number = (await getSetting<number>('defaultThreshold', metadata)) ?? DEFAULT_THRESHOLD;
    const defaultRemove: boolean = (await getSetting<boolean>('defaultRemove', metadata)) ?? false;
    const defaultModnote: boolean = (await getSetting<boolean>('defaultModnote', metadata)) ?? false;
    const defaultCountRemoved: boolean = (await getSetting<boolean>('defaultCountRemoved', metadata)) ?? DEFAULT_KEEP_REMOVED;

    const threshold: number = getUserInputValue<number>(action, 'threshold') ?? defaultThreshold,
        removeOnTrigger: boolean = getUserInputValue<boolean>(action, 'remove') ?? defaultRemove,
        modnote: boolean = getUserInputValue<boolean>(action, 'modnote') ?? defaultModnote,
        countRemoved: boolean = getUserInputValue<boolean>(action, 'countRemoved') ?? defaultCountRemoved;

    switch (action.actionId) {
        case 'checkRepeat':

            const ignoreMods = (await kv.get('ignoreMods')) ?? true;
            const ignoreAutomod = (await kv.get('ignoreAutomod')) ?? true;

            if (ignoreMods && authorIsModFromContext(action)) {
                return {
                    success: true,
                    message: `Will not process Activity because its Author is a Mod`
                }
            } else if (ignoreAutomod && (authorNameFromContext(action) ?? '').includes('automoderator')) {
                return {
                    success: true,
                    message: `Will not process Activity because its Author is Automoderator`
                }
            }

            let obj: Activity;

            if (action.context === ContextType.POST) {
                obj = await reddit.getPostById(`t3_${(action.post as RedditObject).id}` as string, metadata);
            } else if (action.context === ContextType.COMMENT) {
                obj = await reddit.getCommentById(`t1_${(action.comment as RedditObject).id}` as string, metadata);
            } else {
                return {success: false, message: 'Must be run on Post or Comment'};
            }

            let results: RepeatCheckResult;

            try {
                results = await getRepeatCheckResult(obj, {
                    threshold: `>= ${threshold}`,
                    keepRemoved: countRemoved
                }, metadata);
            } catch (e) {
                console.error(e);
                return {
                    success: false,
                    result: `Error occurred while running repeat logic: ${(e as Error).message}`
                }
            }

            let actionRes: TriggerResult = {remove: false, modnote: false};
            const actions = [];

            if (results.triggered) {
                actionRes = await onTrigger(obj.id, results, {
                    remove: removeOnTrigger,
                    modnote: modnote ? {
                        subreddit: subredditIdentifier as string,
                        user: obj.authorName
                    } : undefined
                }, metadata);

                if(actionRes.remove !== undefined) {
                    if(actionRes.remove === true) {
                        actions.push(`REMOVE: ${PASS}`);
                    } else if(typeof actionRes.remove === 'string') {
                        actions.push(`REMOVE: Error :(`);
                    }
                }
                if(actionRes.modnote !== undefined) {
                    if(actionRes.modnote === true) {
                        actions.push(`NOTE: ${PASS}`);
                    } else if(typeof actionRes.modnote === 'string') {
                        actions.push(`NOTE: Error :(`);
                    }
                }
            }

            return {
                success: true,
                message: `${results.result}${actions.length > 0 ? ' | ' : ''}${actions.join(' | ')}`
            }
        case 'checkRepeatModqueue':
        case 'checkRepeatUnmoderated':
            const queue = action.actionId.toLowerCase().includes('modqueue') ? 'modqueue' : 'unmoderated';
            return {
                success: false,
                message: `Fetching ${queue} not yet supported by devvit :(`
            }
        default:
            return {success: false, message: 'Invalid action'};
    }
});

/**
 * Responsible for fetching author's history, passing it to comparison logic, and returning comparison result
 * */
const getRepeatCheckResult = async (item: Activity, userOpts: Partial<CompareOptions> = {}, metadata?: Metadata): Promise<RepeatCheckResult> => {

    // eventually these options will be controlled by app/subreddit-level configuration done by mods when app is installed
    const opts: CompareOptions = {...defaultCompareOptions, ...userOpts};

    // get 1 page of author's posts and comments
    // TODO maybe replace with `/user/overview` api endpoint once it becomes supported?
    const posts = await reddit.getPostsByUser({
        username: item.authorName,
        sort: 'new',
        pageSize: 100,
        limit: 100
    }, metadata).all();
    const comments = await reddit.getCommentsByUser({
        username: item.authorName,
        sort: 'new',
        pageSize: 100,
        limit: 100
    }, metadata).all();

    let allActivities: Activity[] = [...posts, ...comments];

    // in past experiences with public api sometimes the currently processing activity is not returned in the user's history listing (db consistency? acid is hard)
    // so make sure it is included if we don't find it in history
    const hasSubmitted = allActivities.some(x => x.id === item.id);
    if (!hasSubmitted) {
        allActivities.push(item);
    }

    if(!opts.keepRemoved) {
        allActivities = allActivities.filter(x => !x.isRemoved());
    }

    // sort all activities by creation time in descending order (newest activity first)
    allActivities.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime()
    });

    // iterates through all activities and builds up lists of consecutive activities that all match a given identifier
    const condensedActivities = await condenseActivities(allActivities, opts);
    // consolidates all those lists under unique identifiers (we can see each instance (list) of a given repeated content by repeated content identifier)
    // and then filters these consolidated lists so only those that match the currently processing Post/Comment content identifier are left
    const applicableGroupedActivities = extractApplicableGroupedActivities(condensedActivities, opts, opts.useProcessingAsReference ? item : undefined)
    // finally, compares the test condition (threshold) against remaining consolidated lists to see if any match
    // IE threshold: '>= 3' => triggered if any consolidated list has 3 or Activities in it (which means content was repeated 3 or more times)
    return generateResult(applicableGroupedActivities, opts);
}

interface TriggerOptions {
    remove?: boolean,
    modnote?: CreateModNoteOpts | undefined
}

interface TriggerResult {
    remove: boolean | string,
    modnote: boolean | string
}

const onTrigger = async (itemId: string, results: RepeatCheckResult, opts: TriggerOptions, metadata?: Metadata): Promise<TriggerResult> => {
    const {
        remove = false,
        modnote
    } = opts;
    const actions = [];
    if (remove) {
        actions.push('REMOVE');
    }
    if (modnote !== undefined) {
        actions.push('MODNOTE');
    }
    const result: TriggerResult = {
        remove: false,
        modnote: false
    };

    if (actions.length === 0) {
        return result;
    }

    console.log(`${actions.join('/')} ${itemId} => ${results.triggered ? results.summary[0].identifier : 'N/A'} => ${results.result}`);

    if (remove) {
        try {
            await reddit.remove(itemId, false, metadata);
            result.remove = true;
        } catch (e) {
            console.warn(`Error occurred while removing ${itemId}`);
            console.error(e);
            result.remove = (e as Error).message;
        }
    }

    if (modnote !== undefined) {
        try {
            const thing = parseRedditFullname(modnote.subreddit);
            if (thing !== undefined) {
                const subreddit = await reddit.getSubredditById(thing.val, metadata);
                modnote.subreddit = subreddit.name;
            }
            await reddit.addModNote({
                ...modnote,
                note: results.result,
                redditId: itemId,
                label: "SPAM_WATCH"
            }, metadata);
            result.modnote = true;
        } catch (e) {
            console.warn(`Error occurred while adding modnote for ${itemId}`);
            console.error(e);
            result.modnote = (e as Error).message
        }
    }
    return result;
}

Devvit.addTrigger({
    event: Devvit.Trigger.PostSubmit,
    async handler(request: PostSubmit, metadata?: Metadata) {

        const monitorFeeds = await getSetting<string[]>('monitorFeeds', metadata) ?? [];

        if(monitorFeeds.includes('submissions')) {

            const threshold = await getSetting<number>('monSubThreshold',metadata);
            const shouldRemove = await getSetting<boolean>('monSubRemove',metadata) as boolean;
            const shouldModnote = await getSetting<boolean>('monSubModnote',metadata) as boolean;
            const countRemoved = await getSetting<boolean>('monSubCountRemoved', metadata) as boolean;

            if (shouldRemove || shouldModnote) {
                const {
                    author: {
                        name
                    } = {},
                    post: postv2,
                } = request;
                //console.log(`Received OnPostSubmit event:\n${JSON.stringify(request)}`);
                if (name !== undefined && postv2 !== undefined) {

                    const itemId = postv2.id;
                    const item = await reddit.getPostById(itemId, metadata);
                    const results = await getRepeatCheckResult(item, {threshold: `>= ${threshold}`, keepRemoved: countRemoved}, metadata);

                    if (results.triggered) {
                        await onTrigger(itemId, results, {
                            remove: shouldRemove,
                            modnote: shouldModnote ? {
                                subreddit: request.subreddit?.name as string,
                                user: name
                            } : undefined
                        }, metadata);
                    }
                }
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.PostReport,
    async handler(request: PostReport, metadata?: Metadata) {

        const monitorFeeds = await getSetting<string[]>('monitorFeeds', metadata) ?? [];

        if(monitorFeeds.includes('modqueueSub')) {

            const threshold = await getSetting<number>('monSubThreshold',metadata);
            const shouldRemove = await getSetting<boolean>('monSubRemove',metadata) as boolean;
            const shouldModnote = await getSetting<boolean>('monSubModnote',metadata) as boolean;
            const countRemoved = await getSetting<boolean>('monSubCountRemoved', metadata) as boolean;

            if (shouldRemove || shouldModnote) {
                const {
                    post: postv2,
                } = request;
                //console.log(`Received OnPostSubmit event:\n${JSON.stringify(request)}`);
                if (postv2 !== undefined) {

                    const itemId = postv2?.id;
                    const item = await reddit.getPostById(itemId, metadata);
                    const name = item.authorName;
                    const results = await getRepeatCheckResult(item, {threshold: `>= ${threshold}`, keepRemoved: countRemoved}, metadata);

                    if (results.triggered) {
                        await onTrigger(itemId, results, {
                            remove: shouldRemove,
                            modnote: shouldModnote ? {
                                subreddit: request.subreddit?.name as string,
                                user: name
                            } : undefined
                        }, metadata);
                    }
                }
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentSubmit,
    async handler(request: CommentSubmit, metadata?: Metadata) {

        const monitorFeeds = await getSetting<string[]>('monitorFeeds', metadata) ?? [];

        if(monitorFeeds.includes('comments')) {
            const threshold = await getSetting<number>('monCommThreshold',metadata);
            const shouldRemove = await getSetting<boolean>('monCommRemove',metadata) as boolean;
            const shouldModnote = await getSetting<boolean>('monCommModnote',metadata) as boolean;
            const countRemoved = await getSetting<boolean>('monCommCountRemoved', metadata) as boolean;
            if (shouldRemove || shouldModnote) {
                const {
                    author: {
                        name
                    } = {},
                    comment: commentv2,
                } = request;

                //console.log(`Received OnCommentSubmit event:\n${JSON.stringify(request)}`);
                if (name !== undefined && commentv2 !== undefined) {

                    const itemId = commentv2.id;
                    const item = await reddit.getCommentById(itemId, metadata);
                    const results = await getRepeatCheckResult(item, {threshold: `>= ${threshold}`, keepRemoved: countRemoved}, metadata);

                    if (results.triggered) {
                        await onTrigger(itemId, results, {
                            remove: shouldRemove,
                            modnote: shouldModnote ? {
                                subreddit: request.subreddit?.name as string,
                                user: name
                            } : undefined
                        }, metadata);
                    }
                }
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentReport,
    async handler(request: CommentReport, metadata?: Metadata) {

        const monitorFeeds = await getSetting<string[]>('monitorFeeds', metadata) ?? [];

        if(monitorFeeds.includes('modqueueComm')) {
            const threshold = await getSetting<number>('monCommThreshold',metadata);
            const shouldRemove = await getSetting<boolean>('monCommRemove',metadata) as boolean;
            const shouldModnote = await getSetting<boolean>('monCommModnote',metadata) as boolean;
            const countRemoved = await getSetting<boolean>('monCommCountRemoved', metadata) as boolean;
            if (shouldRemove || shouldModnote) {
                const {
                    comment: commentv2,
                } = request;

                //console.log(`Received OnCommentSubmit event:\n${JSON.stringify(request)}`);
                if (commentv2 !== undefined) {

                    const itemId = commentv2.id;
                    const item = await reddit.getCommentById(itemId, metadata);
                    const name = item.authorName;
                    const results = await getRepeatCheckResult(item, {threshold: `>= ${threshold}`, keepRemoved: countRemoved}, metadata);

                    if (results.triggered) {
                        await onTrigger(itemId, results, {
                            remove: shouldRemove,
                            modnote: shouldModnote ? {
                                subreddit: request.subreddit?.name as string,
                                user: name
                            } : undefined
                        }, metadata);
                    }
                }
            }
        }
    },
});

export default Devvit;
