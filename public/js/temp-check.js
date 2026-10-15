// What the Temp Check player screen (activity-03.js) and the host screen (host/host.js)
// have in common. Both show whatever phase the server's game is in, and build each
// screen once and then update it in place.
const TempCheck = (() => {
  const MODE_TITLES = { match: "Be the machine", beat: "Beat the machine" };

  // Which screen the current state calls for.
  function screenName(view) {
    switch (view.phase) {
      case "lobby":
        return "lobby";
      case "intro":
        return "intro";
      case "input":
        return "input";
      case "reveal":
        return view.thinking ? "thinking" : "reveal";
      default:
        return "standings";
    }
  }

  // Changes whenever a different screen has to be built.
  function screenKey(view) {
    return `${view.phase}:${view.round?.index ?? "-"}:${view.thinking}`;
  }

  // Server time minus this device's clock, in ms. Add it to Date.now() to get server time.
  function clockOffset(view) {
    return view.now - Date.now();
  }

  // Seconds left to answer, by the server's clock.
  function secondsLeft(view, offset) {
    return Math.max(0, (view.endsAt - (Date.now() + offset)) / 1000);
  }

  // The sentence, with the blank drawn as a gap. The blank holds a non-breaking space,
  // which gives it the height of a line of text.
  function stemElement(stem, className = "stem") {
    const paragraph = MM.el("p", className);
    stem.split("___").forEach((part, index) => {
      if (index > 0) paragraph.append(MM.el("span", "stem__blank", "\u00a0"));
      paragraph.append(part);
    });
    return paragraph;
  }

  return { MODE_TITLES, screenName, screenKey, clockOffset, secondsLeft, stemElement };
})();
