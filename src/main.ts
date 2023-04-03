import {ContextActionsBuilder, Devvit, RedditAPIClient} from '@devvit/public-api';

import {CommentSubmit, ContextType, Metadata, PostSubmit, RedditObject} from '@devvit/protos';
import {Activity, CompareOptions, CreateModNoteOpts, RepeatCheckResult} from "./Atomic.js";
import {condenseActivities, extractApplicableGroupedActivities, generateResult,} from "./funcs.js";

const reddit = new RedditAPIClient();

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 0,
    matchScore: 85,
    useProcessingAsReference: true,
    threshold: '>= 3'
}

Devvit.ContextAction.onGetActions(async () => {
    return new ContextActionsBuilder()
        .action({
            actionId: 'removeIfRepeat',
            name: 'Remove If Repeated',
            description: 'Remove activity if repeated 3 or more times',
            post: true,
            comment: true,
            moderator: true,
        })
        .action({
            actionId: 'checkRepeat',
            name: `Check For Repeats`,
            description: 'Tells you largest of repeats found for this content',
            post: true,
            comment: true,
            moderator: true,
        })
        .build();
});

Devvit.ContextAction.onAction(async (action, metadata?: Metadata) => {
    let obj: Activity;

    let subredditName: string;
    if (action.context === ContextType.POST) {
        obj = await reddit.getPostById(`t3_${(action.post as RedditObject).id}` as string, metadata);
        subredditName = (action.post as RedditObject).subreddit as string;
    } else if (action.context === ContextType.COMMENT) {
        obj = await reddit.getCommentById(`t1_${(action.comment as RedditObject).id}` as string, metadata);
        subredditName = (action.comment as RedditObject).subreddit as string;
    } else {
        return {success: false, message: 'Must be run on a Post or Comment'};
    }
    const results = await getRepeatCheckResult(obj, metadata);

    switch (action.actionId) {
        case 'checkRepeat':
            return {
                success: true,
                message: results.result
            }
        case 'removeIfRepeat':
            if (results.triggered) {
                await onTrigger(obj.id, results, {subreddit: subredditName as string, user: obj.authorName}, metadata);
            }
            return {
                success: true,
                message: `${results.triggered ? 'REMOVED => ' : 'NOT REMOVED => '} ${results.result}`
            };
        default:
            return {success: false, message: 'Invalid action'};
    }
});

const getRepeatCheckResult = async (item: Activity, metadata?: Metadata): Promise<RepeatCheckResult> => {

    const opts: CompareOptions = {...defaultCompareOptions};

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

    const hasSubmitted = allActivities.some(x => x.id === item.id);
    if (!hasSubmitted) {
        allActivities.push(item);
    }

    allActivities.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime()
    });

    const condensedActivities = await condenseActivities(allActivities, opts);
    const applicableGroupedActivities = extractApplicableGroupedActivities(condensedActivities, opts, opts.useProcessingAsReference ? item : undefined)
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
            const results = await getRepeatCheckResult(item, metadata);

            if (results.triggered) {
                await onTrigger(itemId, results, {subreddit: request.subreddit?.name as string, user: name}, metadata);
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentSubmit,
    async handler(request: CommentSubmit, metadata?: Metadata) {
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
            const results = await getRepeatCheckResult(item, metadata);

            if (results.triggered) {
                await onTrigger(itemId, results, {subreddit: request.subreddit?.name as string, user: name}, metadata);
            }
        }
    },
});

export default Devvit;
