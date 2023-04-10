import {ConfigFormBuilder, ContextActionsBuilder, Devvit, KeyValueStorage, RedditAPIClient} from '@devvit/public-api';

import {CommentSubmit, ContextType, Metadata, PostSubmit, RedditObject} from '@devvit/protos';
import {
    Activity,
    CompareOptions,
    CreateModNoteOpts, DEFAULT_COM_THRESHOLD, DEFAULT_COM_TRIGGER,
    DEFAULT_IGNORE_AUTOMOD,
    DEFAULT_IGNORE_MODS, DEFAULT_SUB_THRESHOLD, DEFAULT_SUB_TRIGGER,
    DEFAULT_THRESHOLD,
    RepeatCheckResult
} from "./Atomic.js";
import {
    authorIsModFromContext, authorNameFromContext,
    condenseActivities,
    extractApplicableGroupedActivities,
    generateResult,
    getUserInputValue,
    msgPrefix,
} from "./funcs.js";

const reddit = new RedditAPIClient();
const kv = new KeyValueStorage();

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 1,
    matchScore: 85,
    useProcessingAsReference: true,
    threshold: `>= ${DEFAULT_THRESHOLD}`
}

Devvit.ContextAction.onGetActions(async () => {
    const newSubTrigger = await kv.get<boolean>('newSubTrigger');
    const newSubThreshold = await kv.get<number>('newSubThreshold');
    const newCommentTrigger = await kv.get<boolean>('newCommTrigger');
    const newCommentThreshold = await kv.get<number>('newCommThreshold');
    const defaultThreshold = await kv.get<number>('defaultThreshold');
    const ignoreMods = await kv.get<boolean>('ignoreMods');
    const ignoreAutomod = await kv.get<boolean>('ignoreAutomod');
    return new ContextActionsBuilder()
        .action({
            actionId: 'checkRepeat',
            name: `Check If Activity is Repeated`,
            description: 'Check if Activity Repeated X or more times (and optionally remove it)',
            post: true,
            comment: true,
            moderator: true,
            userInput: new ConfigFormBuilder()
                .numberField('threshold', 'Check if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                .booleanField('remove', 'Remove if Threshold Met?', false)
                .build()
        })
        .action({
            actionId: 'checkRepeatModqueue',
            name: `Check for Repeated Activities in Modqueue`,
            description: 'Run Repeated Activity check for all Activities in Modqueue',
            subreddit: true,
            userInput: new ConfigFormBuilder()
                .numberField('threshold', 'Check if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                .booleanField('remove', 'Remove if Threshold Met?', false)
                .build()
        })
        .action({
            actionId: 'checkRepeatUnmoderated',
            name: `Check for Repeated Activities in Unmoderated`,
            description: 'Run Repeated Activity check for all Activities in Unmoderated queue',
            subreddit: true,
            userInput: new ConfigFormBuilder()
                .numberField('threshold', 'Check if Activity is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                .booleanField('remove', 'Remove if Threshold Met?', false)
                .build()
        })
        .action({
            actionId: 'setSettings',
            name: `Repeated Activities Default Settings`,
            description: 'Set subreddit-wide settings for Repeat Activity behavior',
            subreddit: true,
            userInput: new ConfigFormBuilder()
                .numberField('defaultThreshold', '(DEFAULT) Remove Activity if it is repeated X or more times', defaultThreshold ?? DEFAULT_THRESHOLD)
                .booleanField('ignoreMods', 'Ignore Activities Made by Automod?', ignoreAutomod ?? DEFAULT_IGNORE_AUTOMOD)
                .booleanField('ignoreAutomod', 'Ignore Activities Made by Mods?', ignoreMods ?? DEFAULT_IGNORE_MODS)
                .booleanField('newCommTrigger', 'Enable auto-remove for New Comments?', newCommentTrigger ?? DEFAULT_COM_TRIGGER)
                .numberField('newCommThreshold', 'Remove new Comment if repeated X or more times (uses DEFAULT if 0)', newCommentThreshold ?? DEFAULT_COM_THRESHOLD)
                .booleanField('newSubTrigger', 'Enable auto-remove for New Submissions?', newSubTrigger ?? DEFAULT_SUB_TRIGGER)
                .numberField('newSubThreshold', 'Remove new Submission if repeated X or more times (uses DEFAULT if 0)', newSubThreshold ?? DEFAULT_SUB_THRESHOLD)
                .build()
        })
        .build();
});

Devvit.ContextAction.onAction(async (action, metadata?: Metadata) => {

    if (action.actionId === 'setSettings') {
        const settings = {
            newSubTrigger: getUserInputValue<boolean>(action, 'newSubTrigger'),
            newSubThreshold: getUserInputValue<number>(action, 'newSubThreshold'),
            newCommTrigger: getUserInputValue<boolean>(action, 'newCommTrigger'),
            newCommThreshold: getUserInputValue<number>(action, 'newCommThreshold'),
            defaultThreshold: getUserInputValue<number>(action, 'defaultThreshold'),
            ignoreMods: getUserInputValue<boolean>(action, 'ignoreMods'),
            ignoreAutomod: getUserInputValue<boolean>(action, 'ignoreAutomod')
        };

        for(const [k, v] of Object.entries(settings)) {
            if(v !== undefined) {
                await kv.put(k, v);
            }
        }

        return {success: true, message: 'Subreddit defaults set! Please refresh the page to see new settings and be aware changes take a few moments to take effect.'};
    } else {

        let subredditName: string | undefined = undefined;
        if (action.context === ContextType.POST) {
            subredditName = (action.post as RedditObject).subreddit as string;
        } else if (action.context === ContextType.COMMENT) {
            subredditName = (action.comment as RedditObject).subreddit as string;
        } else if (action.context === ContextType.SUBREDDIT) {
            subredditName = (action.subreddit?.name) as string;
        }
        if (subredditName === undefined) {
            return {success: false, message: 'Could not determine subreddit?'};
        }

        const defaultThreshold: number = (await kv.get('defaultThreshold')) ?? DEFAULT_THRESHOLD;

        const threshold: number = getUserInputValue<number>(action, 'threshold') ?? defaultThreshold,
            removeOnTrigger: boolean = getUserInputValue<boolean>(action, 'remove') ?? false;

        switch (action.actionId) {
            case 'checkRepeat':

                const ignoreMods = (await kv.get('ignoreMods')) ?? true;
                const ignoreAutomod = (await kv.get('ignoreAutomod')) ?? true;

                if(ignoreMods && authorIsModFromContext(action)) {
                    return {
                        success: true,
                        message: `Will not process Activity because its Author is a Mod`
                    }
                } else if(ignoreAutomod && (authorNameFromContext(action) ?? '').includes('automoderator')) {
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

                const results = await getRepeatCheckResult(obj, {
                    threshold: `>= ${threshold}`
                }, metadata);

                if (removeOnTrigger) {
                    await onTrigger(obj.id, results, {
                        subreddit: subredditName as string,
                        user: obj.authorName
                    }, metadata);
                }
                return {
                    success: true,
                    message: `${msgPrefix(results.triggered, removeOnTrigger)} ${results.result}`
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

    const allActivities: Activity[] = [...posts, ...comments];

    // in past experiences with public api sometimes the currently processing activity is not returned in the user's history listing (db consistency? acid is hard)
    // so make sure it is included if we don't find it in history
    const hasSubmitted = allActivities.some(x => x.id === item.id);
    if (!hasSubmitted) {
        allActivities.push(item);
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

const onTrigger = async (itemId: string, results: RepeatCheckResult, modNoteOpts: CreateModNoteOpts, metadata?: Metadata) => {
    await reddit.remove(itemId, false, metadata);
    console.log(`REMOVING => ${itemId} in ${modNoteOpts.subreddit} by ${modNoteOpts.user} for ${results.result}`);
    // TODO enable once this is fixed
    //await reddit.addModNote({...modNoteOpts, note: results.result, redditId: itemId, label: "SPAM_WATCH"}, metadata);
}

Devvit.addTrigger({
    event: Devvit.Trigger.PostSubmit,
    async handler(request: PostSubmit, metadata?: Metadata) {
        const shouldTrigger: boolean = (await kv.get('newSubTrigger')) ?? DEFAULT_SUB_TRIGGER;
        if(shouldTrigger) {
            const {
                author: {
                    name
                } = {},
                post: postv2,
            } = request;
            //console.log(`Received OnPostSubmit event:\n${JSON.stringify(request)}`);
            if (name !== undefined && postv2 !== undefined) {

                const newSubThreshold = (await kv.get<number>('newSubThreshold')) ?? DEFAULT_SUB_THRESHOLD;
                const itemId = postv2.id;
                const item = await reddit.getPostById(itemId, metadata);
                const results = await getRepeatCheckResult(item, {threshold: `>= ${newSubThreshold}`}, metadata);

                if (results.triggered) {
                    await onTrigger(itemId, results, {subreddit: request.subreddit?.name as string, user: name}, metadata);
                }
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentSubmit,
    async handler(request: CommentSubmit, metadata?: Metadata) {
        const shouldTrigger: boolean = (await kv.get('newComTrigger')) ?? DEFAULT_COM_TRIGGER;
        if(shouldTrigger) {
            const {
                author: {
                    name
                } = {},
                comment: commentv2,
            } = request;

            //console.log(`Received OnCommentSubmit event:\n${JSON.stringify(request)}`);
            if (name !== undefined && commentv2 !== undefined) {

                const newCommentThreshold = (await kv.get<number>('newCommThreshold')) ?? DEFAULT_COM_THRESHOLD;
                const itemId = commentv2.id;
                const item = await reddit.getCommentById(itemId, metadata);
                const results = await getRepeatCheckResult(item, {threshold: `>= ${newCommentThreshold}`},metadata);

                if (results.triggered) {
                    await onTrigger(itemId, results, {subreddit: request.subreddit?.name as string, user: name}, metadata);
                }
            }
        }
    },
});

export default Devvit;
