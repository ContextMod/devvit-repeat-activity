import {Comment, Post} from "@devvit/public-api";
import {PostV2} from '@devvit/protos';

/**
 * @see https://stackoverflow.com/a/61033353/1469797
 */
const REGEX_YOUTUBE: RegExp = /(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:watch|embed)(?:(?:(?=\/[^&\s\?]+(?!\S))\/)|(?:\S*v=|v\/)))([^&\s\?]+)/g;

export const parseUsableLinkIdentifier = (regexes: RegExp[] = [REGEX_YOUTUBE]) => (val?: string): (string | undefined) => {
    if (val === undefined) {
        return val;
    }
    for (const reg of regexes) {
        const matches = [...val.matchAll(reg)];
        if (matches.length > 0) {
            // use first capture group
            // TODO make this configurable at some point?
            const captureGroup = matches[0][matches[0].length - 1];
            if (captureGroup !== '') {
                return captureGroup;
            }
        }
    }
    return val;
}

export const isRedditMedia = (act: Comment | Post): boolean => {
    return act instanceof Post && (
        //act.is_reddit_media_domain ||
        //act.is_video ||
        ['v.redd.it', 'i.redd.it'].includes(act.url)
    );
}

export const isExternalUrlSubmission = (act: Comment | Post): boolean => {
    return act instanceof Post
        && ['redd.it', 'reddit.com'].every(x => !act.url.includes(x))
        && !isRedditMedia(act);
}

export const isPost = (value: any) => {
    try {
        return asPostClass(value) || asPostV2(value);
    } catch (e) {
        return false;
    }
}

export const asPostClass = (value: any): value is Post => {
    return value instanceof Post;
}


export const asPostV2 = (value: any): value is PostV2 => {
    return value !== null && typeof value === 'object' && !(value instanceof Post) && 'id' in value && value.id.includes('t3_');
}

export const asPost = (value: any): value is (Post | PostV2) => {
    return isPost(value);
}

// export const toPost = (value: Post | PostSubmit): Post => {
//     if(value instanceof Post) {
//         return value;
//     }
//     return new Post(value.post as PostV2)
// }
