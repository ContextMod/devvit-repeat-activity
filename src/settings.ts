import {
    SettingsBooleanField,
    SettingsFormField,
    SettingsNumberField,
    SettingsSelectField
} from "@devvit/public-api/settings/types.js";
import {
    DEFAULT_COM_MODNOTE_TRIGGER,
    DEFAULT_COM_REMOVE_TRIGGER,
    DEFAULT_COM_THRESHOLD,
    DEFAULT_IGNORE_APPROVED,
    DEFAULT_IGNORE_AUTOMOD,
    DEFAULT_IGNORE_MODS,
    DEFAULT_KEEP_REMOVED,
    DEFAULT_SUB_MODNOTE_TRIGGER,
    DEFAULT_SUB_REMOVE_TRIGGER,
    DEFAULT_SUB_THRESHOLD,
    DEFAULT_THRESHOLD
} from "./Atomic.js";

const defaultThreshold: SettingsNumberField = {
    type: 'number',
    name: 'defaultThreshold',
    label: 'THRESHOLD -- Trigger if Activity is repeated X or more times',
    helpText: 'Repeats DO NOT include the Activity this is being run on. EX "2 repeats => This Comment AND two others are the same"',
    defaultValue: DEFAULT_THRESHOLD
}

const defaultCountRemoved: SettingsBooleanField = {
    type: 'boolean',
    name: 'defaultCountRemoved',
    label: 'Count already removed Activities?',
    helpText: 'The default state of this option when presented in a menu action -- should repeated Activities that are already removed be counted?',
    defaultValue: DEFAULT_KEEP_REMOVED
}

const defaultRemove: SettingsBooleanField = {
    type: 'boolean',
    name: 'defaultRemove',
    label: 'Remove if Threshold Met?',
    helpText: 'The default state of this option when presented in a menu action',
    defaultValue: false
}

const defaultModNote: SettingsBooleanField = {
    type: 'boolean',
    name: 'defaultModnote',
    label: 'Add Modnote if Threshold Met?',
    helpText: 'The default state of this option when presented in a menu action',
    defaultValue: false
}

export const ignoreMods: SettingsBooleanField = {
    type: 'boolean',
    name: 'ignoreMods',
    label: 'Ignore Mods?',
    helpText: 'Should Activities made by Mods be ignored?',
    defaultValue: DEFAULT_IGNORE_MODS
}

export const ignoreAutomod: SettingsBooleanField = {
    type: 'boolean',
    name: 'ignoreAutomod',
    label: 'Ignore Automodertor?',
    helpText: 'Should Activities made by Automoderator be ignored?',
    defaultValue: DEFAULT_IGNORE_AUTOMOD
}

export const ignoreApprovedActivities: SettingsBooleanField = {
    type: 'boolean',
    name: 'ignoreApproved',
    label: 'Ignore Approved?',
    helpText: 'When monitoring new feeds, should approved Activities be ignored?',
    defaultValue: DEFAULT_IGNORE_APPROVED
}

const monCommThreshold: SettingsNumberField = {
    type: 'number',
    name: 'monCommThreshold',
    label: 'New Comment THRESHOLD',
    helpText: 'When monitoring Comments -- Trigger if Activity is repeated X or more times',
    defaultValue: DEFAULT_COM_THRESHOLD
}

const monCommRemove: SettingsBooleanField = {
    type: 'boolean',
    name: 'monCommRemove',
    label: 'Remove if Threshold Met?',
    helpText: 'If a Comment from a monitored feed triggers the THRESHOLD should it be removed?',
    defaultValue: DEFAULT_COM_REMOVE_TRIGGER
}

const monCommModNote: SettingsBooleanField = {
    type: 'boolean',
    name: 'monCommModnote',
    label: 'Add Modnote if Threshold Met?',
    helpText: 'If a Comment from a monitored feed triggers the THRESHOLD should a modnote be added?',
    defaultValue: DEFAULT_COM_MODNOTE_TRIGGER
}

const monCommCountRemoved: SettingsBooleanField = {
    type: 'boolean',
    name: 'modCommCountRemoved',
    label: 'Count already removed Activities?',
    helpText: 'Should repeated Activities that are already removed be counted?',
    defaultValue: DEFAULT_KEEP_REMOVED
}

export const monSubThreshold: SettingsNumberField = {
    type: 'number',
    name: 'monSubThreshold',
    label: 'New Submission THRESHOLD',
    helpText: 'When monitoring Submissions -- Trigger if Activity is repeated X or more times',
    defaultValue: DEFAULT_SUB_THRESHOLD
}

export const monSubRemove: SettingsBooleanField = {
    type: 'boolean',
    name: 'monSubRemove',
    label: 'Remove if Threshold Met?',
    helpText: 'If a Submission from a monitored feed triggers the THRESHOLD should it be removed?',
    defaultValue: DEFAULT_SUB_REMOVE_TRIGGER
}

export const monSubModNote: SettingsBooleanField = {
    type: 'boolean',
    name: 'monSubModnote',
    label: 'Add Modnote if Threshold Met?',
    helpText: 'If a Submission from a monitored feed triggers the THRESHOLD should a modnote be added?',
    defaultValue: DEFAULT_SUB_MODNOTE_TRIGGER
}

const monSubCountRemoved: SettingsBooleanField = {
    type: 'boolean',
    name: 'modSubCountRemoved',
    label: 'Count already removed Activities?',
    helpText: 'Should repeated Activities that are already removed be counted?',
    defaultValue: DEFAULT_KEEP_REMOVED
}

export const monitorFeeds: SettingsSelectField = {
    type: 'select',
    name: 'monitorFeeds',
    label: 'Which Feeds should be Monitored?',
    helpText: 'The Bot will monitor the chosen feeds and automatically run on any new Activities found',
    multiSelect: true,
    options: [
        {
            label: 'New Submissions',
            value: 'submissions'
        },
        {
            label: 'New Comments',
            value: 'comments'
        },
        {
            label: 'Modqueue (Submissions)',
            value: 'modqueueSub'
        },
        {
            label: 'Modqueue (Comments)',
            value: 'modqueueComm'
        }
    ]
}

export const settings: SettingsFormField[] = [
    {
        type: 'group',
        label: 'Bot Behavior',
        helpText: `Configure how the bot processes an Activity based on Author or Activity state`,
        fields: [
            ignoreMods,
            ignoreAutomod,
        ]
    },
    {
        type: 'group',
        label: 'Menu Action Defaults',
        helpText: `Configure the default states for options in the Bot's menu actions`,
        fields: [
            defaultThreshold,
            defaultCountRemoved,
            defaultRemove,
            defaultModNote
        ]
    },
    {
        type: 'group',
        label: 'Feed Monitoring',
        helpText: `Configure the Bot's behavior when monitoring feeds`,
        fields: [
            monitorFeeds,
            ignoreApprovedActivities,
            {
                type: 'group',
                label: 'Comments',
                helpText: `Configure settings Bot will used when processing a Comment from a Feed`,
                fields: [
                    monCommThreshold,
                    monCommCountRemoved,
                    monCommRemove,
                    monCommModNote
                ]
            },
            {
                type: 'group',
                label: 'Submissions',
                helpText: `Configure settings Bot will used when processing a Submission from a Feed`,
                fields: [
                    monSubThreshold,
                    monSubCountRemoved,
                    monSubRemove,
                    monSubModNote
                ]
            }
        ]
    }
];
