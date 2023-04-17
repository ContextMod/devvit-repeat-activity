
# Repeated Activity Detection

Based on [ContextMod's Repeat Activity Rule](https://github.com/FoxxMD/context-mod/tree/master/docs/subreddit-configuration/in-depth/repeatActivity)

# Overview

The bot will check for patterns of repetition in an Author's Submission/Comment history and can optionally remove and/or add modnote if a threshold is crossed.


## Use-case/Scenario

User A has made 3 comments/submissions with the text `Check out MyCoolApp for free! http://my.link` in their recent history. User A then makes a comment/submission in your subreddit with the same text.

A moderator runs the action `Check If Activity is Repeated` from the context menu on this piece of content and specifies how many "repeated" pieces of content triggers the bot:
  * The bot checks User A's history to see if the content has been repeated X times or more
  * Then it displays a message to the moderator with its findings: `4x repeats found; PASSES test >= 3`
    * If specified by the mod, the content is removed
    * If specified by the mod, a Modnote is added to User A with the same findings displayed by the bot

Default settings for all inputs can be found in the subreddit-level `Repeated Activities Default Settings` context menu action. Within the settings the bot can also be enabled to automatically run on all new comments/submissions.

## Actions

Provides these content menu actions on comments/posts:

* **Check If Activity is Repeated** => Runs through repeat detection and displays a toast on whether Activity meets threshold
  * Optionally remove Activity if threshold is met
  * Optionally add a Modnote if threshold is met

Provides these content menu actions on subreddit:

* **Repeated Activities Default Settings** Set subreddit defaults

Additionally, the bot can run on `Post Submit` and `Comment Submit` so it automatically checks all new posts/comments.

# Configuration

## On Subreddit

Set with a subreddit-level context menu action:

* `Ignore Mods` - Don't check Activities created by Mods (default true)
* `Ignore Automod` - Don't check Activities created by Automod (default true)
* Action Defaults
  * `Default Threshold` - DEFAULT threshold used => Remove Activity if it is repeated X or more times (default `3`)
  * `Remove Option Checked?` - Should the "Remove on trigger" for actions always be checked?
  * `Modnote Option Checked?` - Should the "Add Modnote on trigger" for actions always be checked?
* On New Comments...
  * `New Comment Threshold` - Threshold to use when checking new comments
  * `Remove if New Comment Threshold Met?` - Remove new comments if threshold is met?
  * `Modnote if New Comment Threshold Met?` - Remove new comments if threshold is met?
* On New Submissions...
  * `New New Submission Threshold` - Threshold to use when checking new submission
  * `Remove if New Submission Threshold Met?` - Remove new submission if threshold is met?
  * `Modnote if New Submission Threshold Met?` - Remove new submission if threshold is met?

## Gap Allowance

`gapAllowance` determines how many **non-repeat Activities** are "allowed" between "in a row" submissions. `N` number of non-repeat activities will be thrown away during the count which allows checking for patterns with a bit of "fuzziness".

When not defined `gapAllowance: 1`.

## Match Score

To determine sameness between two pieces of content the bot uses an average of

* [Dice's Coefficient](https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient)
* [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
* [Levenshtein Distance](https://en.wikipedia.org/wiki/Levenshtein_distance)

weighted by the length of the content being compared (more weight for longer content).

The sameness is then given a **score of 0 to 100.**

* 0 => Totally unique pieces of content
* 100 => Identical content

Content is considered repeated if its score is at or above `matchScore` with the content it is being compared to

EX `matchScore: 50`
* Content B has a score of 70 against Content A, which is higher than 50
* Content B is a repeat of Content A

When not defined the bot defaults to `matchScore: 85`

## Min Word Count

When pulling activity from an Author's history the bot will filter out any content that is shorter than `minWordCount` number of word-like tokens.

If the min is not met it does **not** count against repeats (it is as if the content never existed).

When not defined the bot defaults to `minWordCount: 1` (content must have at least one non-space character)

## Use Processing as Reference

When set to `true` then sets of repeated content found are filtered so only those matching the comment/post being (by devvit trigger or from context menu) processed are returned.

Defaults to `true`

## Threshold

A comparison test that determines if the bot is "triggered" by some number of repeated content found.

EX `>= 3` => If 3 or more pieces of repeated content are found then the bot is triggered.

Defaults to `>= 3`
