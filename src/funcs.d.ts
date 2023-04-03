import { Comment, Post } from "@devvit/public-api";
import { Activity, CompareOptions, GroupedActivities, RepeatActivityData, RepeatActivityReducer, SummaryData } from "./Atomic.js";
export declare const getActivityIdentifier: (activity: (Post | Comment), length?: number) => string;
export declare const condenseActivities: (activities: (Post | Comment)[], opts: CompareOptions) => Promise<{
    openSets: RepeatActivityData[];
    allSets: RepeatActivityData[];
}>;
export declare const extractApplicableGroupedActivities: (condensedActivities: RepeatActivityReducer, opts: CompareOptions, item?: Activity) => GroupedActivities;
export declare const generateResult: (applicableGroupedActivities: GroupedActivities, opts: CompareOptions) => {
    triggered: boolean;
    result: string;
    summary: SummaryData[];
};
//# sourceMappingURL=funcs.d.ts.map