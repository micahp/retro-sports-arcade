# Human playtest gate

Statistical calibration says whether the event distributions look like hockey. It says nothing about whether the game feels good to play. Autoplay results, passing tests and calibrated averages are **not evidence for this gate**. Only people holding the controls are.

A build passes this gate only when every item below has been scored by at least three players, on a phone and on a desktop. Each scored item needs a short note on what was seen.

## Session protocol

1. Record the build commit and device for each session (phone model, browser, desktop or touch).
2. Run three tasks of five minutes each, cold, with no coaching beyond the menu text:
   - one regulation game;
   - the Puck Lab replays;
   - one Overtime 3-on-3 game.
3. Record the screen (the phone's screen recorder is enough) and keep the file name with the score sheet.
4. Score each item 1–5 (1 = broken, 3 = acceptable, 5 = right) and write one line on why. A "why" that only describes your feeling is fine.
5. Note every moment you lost the puck on screen, did something you didn't intend, or saw something physically wrong. Give it a timestamp in the recording.

## Items

| Area | Item | What 3 (acceptable) means |
|---|---|---|
| Puck readability | Can you follow the puck at full speed, on shots and on passes? | You can always say where it is within half a second |
| | Does the puck on screen go where its motion says it will (no jumps, no hidden teleports)? | No visible jumps |
| Movement | Skating: acceleration, top speed, turning radius, glide | Feels like skating, not running or driving |
| | Stopping and reversing | Stops happen when you mean them to |
| Passing | Can you aim a pass at the teammate you meant? | You hit the intended teammate most of the time |
| | Do receptions look like the puck arrives on the stick? | No snapping or magnet pucks |
| Shooting | Wrist versus slap timing; can you choose where it goes? | Release timing is learnable within one game |
| | Do saves, rebounds and posts look like the puck hit something? | They do |
| Checking | Do hits happen when you skate into someone, and only then? | You can predict a hit before it happens |
| | Do poke checks feel fair, both ways? | They do |
| Controls | Stick and buttons on a phone; keyboard on desktop | No missed or accidental inputs |
| | Does control switching (after passes, on SWITCH) pick the player you expect? | It does |
| Camera | Do you see enough ice ahead of the play? | You see passing options before you need them |
| AI | Do teammates get open? Do opponents defend and pressure believably? | Teammates give you options; opponents don't feel random or psychic |
| Overall | Would you play another game? | Yes, without being asked |

## Recording sheet

```
build: <commit>   device: <model, browser>   player: <initials>   date:
item                                score  note / timestamp
puck: follow at speed                 _
puck: no jumps                        _
...
```

Results go in `calibration/playtests/<date>-<initials>.md`. The gate passes when every item's median score is at least 3, and no item has an unexplained 1.
