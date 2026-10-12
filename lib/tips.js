// Golf tips for juniors and parents, one per social card (Admin > Social
// cards > Golf tip). Add new ones at the end so existing numbers don't move.
// `for` is who the tip speaks to: juniors, parents or everyone.
// Rule references are to the Rules of Golf (2023 edition).

const TIPS = [
  {
    for: 'everyone', title: 'Leave the course as you found it',
    body: 'Repair your pitch mark on the green (and one more if you can), replace or fill your divots, and rake the bunker on your way out.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'juniors', title: 'Count your clubs',
    body: 'Count them on the first tee. The limit is 14, and carrying more costs two penalty strokes for each hole it happens on, up to four.',
    tag: '#RulesOfGolf'
  },
  {
    for: 'juniors', title: 'Mark your ball',
    body: 'Put your own mark on your ball and tell your playing partners which ball you are using. Playing the wrong ball costs two strokes.',
    tag: '#RulesOfGolf'
  },
  {
    for: 'juniors', title: 'Still and quiet',
    body: 'When someone is playing, stand still, stay quiet, and stand where they can\'t see you. Not behind them, and not on their line on the green.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'juniors', title: 'Be ready to play',
    body: 'Pick your club, put your glove on and work out your yardage while others play, so you\'re ready when it\'s your turn.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'juniors', title: 'Check your card',
    body: 'Check every hole with your marker before you sign. Sign for a lower score than you took and you\'re disqualified; a higher one stands.',
    tag: '#RulesOfGolf'
  },
  {
    for: 'juniors', title: 'Shout "Fore!"',
    body: 'If your ball could hit someone, shout "Fore!" straight away and loudly. If you hear it, crouch down and cover your head.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'juniors', title: 'Finish with a handshake',
    body: 'Take your cap off, shake hands and thank your playing partners and marker, however the round went.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'parents', title: 'Save the coaching for later',
    body: 'Only a caddie can give advice during a round, and many junior events don\'t allow caddies. Keep the tips for the practice ground.',
    tag: '#GolfParents'
  },
  {
    for: 'parents', title: 'Watch from a distance',
    body: 'Check the event\'s rules for spectators. Some junior opens ask parents to stay off the course; where you can walk, keep well back and stay quiet.',
    tag: '#GolfParents'
  },
  {
    for: 'parents', title: 'Enjoyment first',
    body: 'Ask "Did you enjoy it?" before "What did you score?". Juniors who love the game keep playing it.',
    tag: '#GolfParents'
  },
  {
    for: 'parents', title: 'Phones away',
    body: 'Many clubs don\'t allow mobile phones in the clubhouse or on the course. Check before the day, and put yours on silent.',
    tag: '#GolfParents'
  },
  {
    for: 'everyone', title: 'Arrive early',
    body: 'Aim to be there 45 minutes before the tee time: register, show handicap ID, warm up, and find the first tee without a rush.',
    tag: '#JuniorGolfTips'
  },
  {
    for: 'everyone', title: 'Check the dress code',
    body: 'Most clubs ask for collared shirts and tailored trousers or shorts, and no denim. Check the club\'s website before the day.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'everyone', title: 'Pack the bag the night before',
    body: 'Water, snacks, waterproofs, spare balls, tees, a pitch mark repairer, a pencil and handicap ID. Leaving it until morning is when things get forgotten.',
    tag: '#JuniorGolfTips'
  },
  {
    for: 'juniors', title: 'Winter rules',
    body: 'If the club has preferred lies in play, you can lift, clean and place your ball on the fairway within the distance set. Check the notice board first.',
    tag: '#WinterGolf'
  },
  {
    for: 'juniors', title: 'Keep up the pace',
    body: 'Keep up with the group in front, not just ahead of the group behind. Walk briskly between shots and leave the green as soon as you\'ve holed out.',
    tag: '#GolfEtiquette'
  },
  {
    for: 'everyone', title: 'Know your handicap ID',
    body: 'Have your CDH ID to hand in the app or on a card. Many junior opens ask for it when you register.',
    tag: '#JuniorGolfTips'
  }
];

const AUDIENCE = { juniors: 'For juniors', parents: 'For parents', everyone: 'For juniors and parents' };

// Tip by its number (1-based); anything out of range gives tip 1
function tipByNumber(n) {
  const i = Math.max(1, Math.min(TIPS.length, Number(n) || 1));
  return { number: i, ...TIPS[i - 1], audience: AUDIENCE[TIPS[i - 1].for] };
}

module.exports = { TIPS, AUDIENCE, tipByNumber };
