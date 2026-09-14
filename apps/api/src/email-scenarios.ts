/** Authored fictional situations for offline drafts; never evidence of real offers or fixtures. */
export function preparedEmailStory(topic: string, angle: string, context = topic): { subject: string; bodyText: string } | undefined {
  if (/\bwings?\b/i.test(topic) && /\bbroncos\b/i.test(topic) && !["resource", "update"].includes(angle)) {
    const opponent = context.match(/\b(?:Chargers|Raiders|Chiefs|Cowboys|Seahawks|Bills|Steelers)\b/i)?.[0] ?? "Chargers";
    const team = opponent[0].toUpperCase() + opponent.slice(1).toLowerCase();
    const occasion = /\bsunday\b/i.test(context) ? "Sunday football" : "Thursday Night Football";
    const shortOccasion = occasion === "Sunday football" ? "Sunday" : "TNF";
    return {
      subject: `Broncos–${team} ${shortOccasion}: 12 wings, fries, $12`,
      bodyText: `${occasion} at our place: Denver Broncos vs. ${team} on the big screens, with 12 buffalo wings and a basket of fries for $12. Choose mild, hot, or extra hot; the game-night special runs from kickoff through the final whistle.\n\nBring your crew or grab a seat at the bar. See the ${shortOccasion} menu and table options using the response below.`,
    };
  }
  const stories: [RegExp, string, string][] = [
    [/\bchess\b/i, "Three endgames. One coffee break.", "Can a lone king catch the pawn? This week's chess puzzle sheet starts with that position, then adds two rook endgames with a twist. Each answer includes the move that changes the result.\n\nTry the positions before turning to the solutions using the response below."],
    [/\b(?:coffee|espresso)\b/i, "A new espresso on the tasting bar", "We're dialing in a new coffee with notes of cocoa and orange peel. This weekend's tasting compares the same beans as espresso and a pour-over, so you can see what the brewing method changes.\n\nBrowse the tasting menu using the response below."],
    [/\b(?:photography|film|camera)\b/i, "Saturday's film walk: reflections after rain", "One roll, one lens, and a route through the covered market. Our next photography walk focuses on window reflections and working with flat light; bring any film camera you're comfortable with.\n\nSee the route and meeting notes using the response below."],
    [/\b(?:music|acoustic|concert|guitar)\b/i, "An acoustic set in the back room", "Two guitars, close harmonies, and a seated room with no opening act. Friday's acoustic set starts with fingerpicked originals and finishes with a few audience requests.\n\nCheck the set details and seating options using the response below."],
    [/\b(?:baking|bread|sourdough)\b/i, "What your sourdough is doing between folds", "A dough that spreads sideways isn't always underproofed. Our sourdough notes compare two loaves at each fold, with photos showing when the surface starts holding its shape.\n\nOpen the baking notes and fold-by-fold checklist using the response below."],
    [/\b(?:herbs?|gardening|garden)\b/i, "Basil looking tired? Check the pot first", "Small pots dry out faster than a watering calendar suggests. Our herb guide shows how to check the soil below the surface, spot crowded roots, and trim basil without removing its next set of leaves.\n\nSee the windowsill gardening guide using the response below."],
    [/\b(?:trains?|railway|railroad)\b/i, "The branch line is ready for its first run", "The model train display now has a passing loop beside the station, so two trains can run without backing into the yard. The layout notes show the new track plan and where the turnout controls sit.\n\nExplore the railway display update using the response below."],
    [/\borigami\b/i, "One square of paper, one folded lantern", "A lantern is a good origami project for practicing reverse folds. Our illustrated folding plan marks the creases to make first and the point where the flat sheet begins to open into a pocket.\n\nSee the lantern steps using the response below."],
    [/\b(?:pottery|clay|ceramics?)\b/i, "Try the speckled glaze on a small test tile", "Our pottery studio has a new speckled glaze on the sample shelf. The test tiles show how one coat compares with two, including the edge where the color breaks over texture.\n\nView the glaze samples and open-studio details using the response below."],
  ];
  const story = stories.find(([pattern]) => pattern.test(topic));
  return story ? { subject: story[1], bodyText: story[2] } : undefined;
}
