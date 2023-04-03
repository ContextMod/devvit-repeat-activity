
# Repeated Activity Detection

Based on [ContextMod's Repeat Activity Rule](https://github.com/FoxxMD/context-mod/tree/master/docs/subreddit-configuration/in-depth/repeatActivity)

# Overview

The bot will check for patterns of repetition in an Author's Submission/Comment history.

If it is triggered it removes the content and (TODO) adds a modnote with found results.

Provides these content menu actions on comments/posts:

* **Remove If Repeated** => Remove activity if repeated X or more times (based on `threshold`)
* **Check For Repeats** => Runs through repeat detection and displays a toast stating how many times content was repeated

Additionally, the bot runs on `Post Submit` and `Comment Submit` so it automatically checks all new posts/comments.

# Configuration

**TODO** Coded for but only possible once app/subreddit-level configuration is support by Devvit.

## Gap Allowance

`gapAllowance` determines how many **non-repeat Activities** are "allowed" between "in a row" submissions. `N` number of non-repeat activities will be thrown away during the count which allows checking for patterns with a bit of "fuzziness".

When not defined `gapAllowance: 0` so all repeats must be truly consecutive.

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

When set to `true` then sets of repeated content found are filtered so only those matching the comment/post being filtered are returned.

Defaults to `true`

## Threshold

A comparison test that determines if the bot is "triggered" by some number of repeated content found.

EX `>= 3` => If 3 or more pieces of repeated content are found then the bot is triggered.
