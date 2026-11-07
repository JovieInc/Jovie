// Calibration decks for the "would you invest" eval. Known-bad holdouts must
// come out `pass` for every persona; the positive anchor must come out
// `invest` for most. If not, the judge is sycophantic (holdout yes) or too
// harsh to mean anything (anchor no), and the gate stays closed.
//
// The anchor paraphrases the public 2008 AirBed&Breakfast seed deck (Airbnb,
// YC W09), anonymized so the judge cannot score the brand it knows.

export const HOLDOUTS = Object.freeze([
  {
    id: 'holdout-hype',
    why: 'unsourced inflated claims, no product, no team specifics',
    deck: `SLIDE 1 (cover)
NovaBeat: the AI-powered revolution for the creator economy.
SLIDE 2 (problem)
Creators everywhere struggle with everything. The pain is massive.
SLIDE 3 (solution)
A next-generation platform leveraging cutting-edge AI, Web3 and synergy to empower creators.
SLIDE 4 (traction)
Massive viral interest. Expected 1M users by Q3. Partnerships coming soon with top labels.
SLIDE 5 (market)
$500B TAM. If we capture 1% we are a $5B company.
SLIDE 6 (team)
Passionate, dedicated team giving 110%.
SLIDE 7 (ask)
Raising $5M at a $50M cap.`,
  },
  {
    id: 'holdout-vague',
    why: 'no numbers, no ask, no founder achievement',
    deck: `SLIDE 1 (cover)
Tunely helps musicians.
SLIDE 2 (problem)
Music is hard.
SLIDE 3 (solution)
An app for musicians with many useful features.
SLIDE 4 (traction)
People like it.
SLIDE 5 (team)
We love music.`,
  },
  {
    id: 'holdout-contradiction',
    why: 'figures contradict each other across slides',
    deck: `SLIDE 1 (cover)
Fanloop: release pages for independent artists.
SLIDE 2 (traction)
1,200 paying artists and $40K MRR as of October.
SLIDE 3 (business model)
$9 a month subscription. (1,200 x $9 is $10.8K, not $40K.)
SLIDE 4 (team)
Two founders, both part time; one starts full time next year.
SLIDE 5 (ask)
$500K funds 36 months at $30K a month.`,
  },
]);

export const ANCHOR = Object.freeze({
  id: 'anchor-yc-funded-2008',
  why: 'public seed deck of a company YC funded (anonymized)',
  deck: `SLIDE 1 (cover)
RoomLocal: book rooms with locals, rather than hotels.
SLIDE 2 (problem)
Price is an important concern for customers booking travel online. Hotels leave you disconnected from the city and its culture. No easy way exists to book a room with a local or become a host.
SLIDE 3 (solution)
A web platform where users can rent out their space to host travelers to: save money when traveling, make money when hosting, share culture with locals.
SLIDE 4 (market validation)
630,000 users on a leading couch-sharing site. 17,000 temporary housing listings on San Francisco and New York classifieds in one week of July.
SLIDE 5 (market size)
2B+ trips booked worldwide; 560M budget and online trips; 84M trips with RoomLocal is 15% of the available market.
SLIDE 6 (product)
Search by city, review listings, book. Live site with listings in launch cities.
SLIDE 7 (business model)
We take a 10% commission on each transaction. 84M trips x $20 average fee = $1.68B revenue opportunity.
SLIDE 8 (adoption)
Events: launched at large conferences where hotels sell out (80 bookings at one event). Partnerships with cheap travel sites. Classifieds dual-posting.
SLIDE 9 (competition)
Hotels and hostels (expensive, impersonal); couch-sharing (free, no transaction); classifieds (no trust). We are first to market for transaction-based local lodging.
SLIDE 10 (team)
Three founders. Designer with a patent and a product shipped to market. Designer who ran business development and brand. Engineer from Harvard computer science who built a social app with 75,000 users.
SLIDE 11 (ask)
Raising $500K for 12 months, targeting 80,000 transactions.`,
});
