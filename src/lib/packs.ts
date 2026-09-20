export type Spectrum={id:string;left:string;right:string;tags:string[]};export type Pack={id:string;name:string;emoji:string;spectra:Spectrum[]};
const naughtyCards=`
Play it cool|Make the first move
Cheeky text|Send a risky photo
Slow dance|Dance against me
Eye contact|Lip bite
Kiss hello|Kiss goodbye
Sweet compliment|Dirty compliment
Hold hands|Hold me closer
First date|Last call
Romantic dinner|Midnight rendezvous
Flirt across the room|Pull me into a corner
Secret crush|Open invitation
Stay in|Sneak out together
Champagne toast|Champagne shower
Love song|Bedroom playlist
Candlelight|Lights off
Soft smile|Hungry stare
Playful dare|Private challenge
Long look|Slow undress
Voice note|Breathy voicemail
Goodnight kiss|Do not let me sleep
Handwritten note|Lipstick message
Cute nickname|Name whispered slowly
First move|Take control
Shy grin|Confident smirk
Brush my hand|Trace my skin
Sit beside me|Sit on my lap
Leave space|Close the distance
Ask nicely|Tell me what you want
Keep it sweet|Make it filthy
One more drink|One more kiss
Favorite outfit|Nothing but confidence
Silk blouse|Open shirt
Little black dress|Red-hot lingerie
Buttoned collar|Loose tie
High heels|Bare feet
Fresh sheets|Rumpled sheets
Perfume|Scent on my pillow
Lip gloss|Lipstick on my neck
Soft robe|Borrowed shirt
Elegant updo|Messy hair
New underwear|Something lacy
Suit and tie|Shirt on the floor
Favorite sweater|No sweater at all
Raincoat|Rain-soaked clothes
Morning coffee|Morning temptation
Hotel lobby|Hotel room
Corner booth|Back booth
Rooftop drinks|Balcony after dark
Guest room|Master bedroom
Locked door|Do not disturb
Window seat|Fogged-up window
Warm bath|Shared shower
Candlelit tub|Steamy mirror
Slow morning|No sleep tonight
Early checkout|Late checkout
Private balcony|Private balcony door
City lights|Curtains closed
Quiet hotel|Thin hotel walls
Room service|Midnight snack in bed
Fresh towels|Towel drop
Weekend away|One-night escape
Pack light|Pack something daring
Road trip|Pulled-over kiss
Beach walk|Beach after dark
Poolside drink|Poolside secret
Cabin fireplace|Cabin bedroom
Tent camping|Sleeping bag for two
Late-night drive|Park somewhere quiet
Backseat conversation|Backseat distraction
The spare key|The locked suite
Elevator glance|Elevator corner
Stairwell kiss|Rooftop rendezvous
Parking-lot goodbye|Drive home together
Last train|First train
Midnight snack|Midnight feast
Order dessert|Feed me dessert
Share a straw|Share a secret
One bite|One taste
Cherry on top|Cherry between us
Chocolate fondue|Chocolate on skin
Whipped cream|No napkins
Red wine|Wine on the sheets
Sparkling water|Spiked punch
Sweet tooth|Dangerous appetite
Kitchen dance|Kitchen counter
Cooking together|Distracting the chef
Apron strings|Untied apron
Flour on my nose|Hands on my waist
Dish duty|Shower duty
Movie night|Skip the movie
Rom-com|Steamy thriller
Shared blanket|Shared heat
Couch cuddle|Couch make-out
Remote control|No distractions
Pause the movie|Turn off the screen
Whispered clue|Whispered fantasy
Inside joke|Private code
Secret signal|Open invitation
Text me later|Come over now
Typing bubbles|Photo attachment
Read receipt|Seen at midnight
Good morning text|Come back to bed
Voice call|Video call
Flirty meme|Flirty selfie
Delete the chat|Save the chat
Heart emoji|Eggplant emoji
Kiss mark|Fingerprints
One line of lipstick|A whole trail of lipstick
Neck kiss|Neck kisses
Forehead kiss|Kiss everywhere else
Slow kiss|Breathless kiss
Peck on the cheek|Kiss me properly
Hands above the waist|Hands with permission
Fingers intertwined|Fingers wandering
Arm around me|Pull me in
Back rub|Massage oil
Shoulder rub|Lower back touch
Hair brush|Hair tug
Whisper in my ear|Talk dirty to me
Call me beautiful|Call me irresistible
Make me laugh|Make me blush
Keep me guessing|Tell me exactly
Ask permission|Give permission
Green light|Red-hot light
Safe word|Safeword check-in
Playful teasing|Relentless teasing
Slow burn|No patience
Take your time|Do not make me wait
One kiss|Keep going
Almost kiss|Finally kiss
Close call|Caught staring
Doorbell rings|Ignore the doorbell
Neighbors nearby|No one can hear us
Public flirt|Private scandal
Restaurant table|Under the table
Dance floor|Dark hallway
Office crush|After-hours office
Work trip|Work trip with benefits
Friends with chemistry|Friends with benefits
Old flame|New temptation
Second date|One-night mistake
Dating app match|Match in person
Stranger at the bar|Regular at the bar
Mystery guest|Familiar lover
Roleplay|Stay in character
Costume party|Costume comes off
Truth or dare|Dare with consequences
Never have I ever|Tell me everything
Would you rather|You choose
Blindfold|Trust me
Handcuffs|Hands above your head
Silk tie|Tied to the bedpost
Feather tease|Fingertip tease
Ice cube|Warm breath
Scented candle|Melted wax
Music low|Music off
Lights dim|Lights out
Mirror glance|Watch us
Camera shy|Polaroid proof
Keep it private|Leave a souvenir
One secret|No secrets tonight
Sweet talk|Dirty talk
Romantic fantasy|Naughty fantasy
Take the lead|Give up control
Switch roles|Stay in charge
Slow tease|Strip tease
Fully dressed|Barely dressed
Under the covers|On top of the covers
Good behavior|Very bad behavior
Be good|Make me behave
Kiss and tell|Never tell
Morning after|No regrets
Stay for breakfast|Stay until dinner
One more night|Move in tonight
Close friends|Closer lovers
Soft landing|Worth the trouble
Late spark|Full blaze
See you soon|Do not leave yet
`.trim();
const p=(packId:string,x:string)=>(packId==="naughty"?naughtyCards:x).split(/[~\n]+/).map((v,index)=>{const[left,rawRight]=v.split("|").map((part)=>part.trim());const right=rawRight||(left==="Midnight drive"?"Sunrise drive":"Dawn drive");return{id:packId+"-"+String(index+1).padStart(2,"0"),left,right,tags:[packId]}});
export const PACKS:Pack[]=[
 {id:"daily",name:"Daily Signals",emoji:"☀️",spectra:p("daily","Wake early|Sleep in~Homemade|Takeout~Text it|Call it~Spontaneous|Planned~Window seat|Aisle seat~Hot coffee|Iced coffee~City walk|Nature walk~Early|Fashionably late~Notebook|Notes app~Sweet snack|Salty snack~Library|Bookstore~Morning shower|Night shower~One trip|Many trips~Rewatch|Try new~Shoes on|Shoes off~Calendar full|Calendar open~Phone camera|Film camera~Dine in|Picnic~Long playlist|One album~Talk it out|Think it through~Minimalist|Maximalist~Big group|One-on-one~Buy it|Borrow it~Sunrise|Sunset~Workout solo|Workout class~House party|Going out~Fast reply|Thoughtful reply~Clean now|Clean later~Early bird|Night owl~Routine|Surprise" )},
 {id:"culture",name:"Culture Club",emoji:"🎬",spectra:p("culture","Cult classic|Blockbuster~Book first|Screen first~Serious|Silly~Comfort watch|Challenge watch~Live music|Studio recording~Plot|Character~Museum|Concert~Subtitles on|Subtitles off~Slow burn|Instant hook~Classic|Contemporary~Indie|Mainstream~Reboot|Original~Solo artist|Ensemble~Jukebox|Algorithm~Theater|Couch~Fiction|Documentary~Binge|Weekly~Lyrics|Melody~Trailer avoider|Trailer watcher~Film grain|Digital polish~Hero|Antihero~Happy ending|Ambiguous ending~Poetry|Prose~Broadway|Basement show~Vintage|Futuristic~Spooky|Cozy~Meme|Quote~Cover|Original~Drama|Comedy~Thought-provoking|Pure fun" )},
 {id:"food",name:"Taste Test",emoji:"🍋",spectra:p("food","Mild|Extra spicy~Crunchy|Chewy~Brunch|Midnight snack~Sauce aside|Sauce everywhere~Sweet breakfast|Savory breakfast~Shared plates|Own entrée~Tiny bites|Giant bowl~Familiar order|New item~Lemon|Chocolate~Street food|Tasting menu~Breakfast all day|Dinner only~Fork|Hands~Fancy plating|Big portions~Sparkling|Still~Crispy edge|Soft center~Dessert first|Dessert last~Dip|Drizzle~Pickles|No pickles~Coffee shop|Bakery~Noodles|Rice~Salad|Sandwich~Fruit dessert|Baked dessert~Food truck|Sit-down~Spice blend|Fresh herbs~Comfort food|Health kick~Pie|Cake~Local spot|Chain favorite~Snack board|Full meal~Sour|Sweet~Recipe follower|Improviser" )},
 {id:"places",name:"Places, Please",emoji:"🗺️",spectra:p("places","Mountains|Beach~Small town|Big city~Museum day|Theme park~Train ride|Road trip~Camping|Hotel~Map out|Wander~Landmark|Hidden gem~Coast|Countryside~Cabin|Apartment~Passport|Staycation~Busy market|Quiet café~Sun|Snow~Day trip|Long haul~Scenic route|Fastest route~Northern escape|Southern escape~Trail|Boardwalk~Hostel|Resort~Early flight|Red-eye~Desert|Forest~Historic streets|Modern skyline~Tour guide|Self guided~National park|City park~Souvenir|Photo~Ferry|Subway~Tent|Glamping~Rainy day|Clear sky~Neighborhood bar|Rooftop bar~Familiar route|Scenic route~Museum map|No plan~Beach day|Trail day" )},
 {id:"people",name:"Human Energy",emoji:"✨",spectra:p("people","Quiet confidence|Big energy~Diplomatic|Direct~Listener|Storyteller~Optimist|Realist~Competitive|Collaborative~Reserved|Open book~Go with flow|Take charge~Punctual|Flexible~Heart|Head~Tease|Encourage~Host|Guest~Group chat|Private text~Risk taker|Careful planner~Tradition|Reinvention~Quick decision|Deep thought~Observer|Initiator~Practical gift|Sentimental gift~Straight face|Expressive face~Forgive fast|Remember all~Calm|Chaotic good~Coach|Cheerleader~Homebody|Social butterfly~Bold|Understated~Debate|Agree~Routine|Variety~Blunt|Diplomatic~Independent|Team player~Nostalgic|Forward-looking~One best friend|Many friends~Spark|Stability" )},
 {id:"internet",name:"Internet Brain",emoji:"💻",spectra:p("internet","Voice note|Typing~Bookmark|Screenshot~Group chat|Server~Desktop|Mobile~Dark mode|Light mode~Search it|Ask friend~GIF|Emoji~Podcast|Short video~Playlist|Radio~Pinned tab|Clean tabs~Mute|Unfollow~Link drop|Long explanation~Shortcut|Menu click~Email|DM~Wi-Fi|Data~Autoplay|Manual~Online shop|In-store~Infinite scroll|One article~Tab hoarder|Tab closer~Password manager|Memory~Profile pic|No avatar~Comment|Lurk~Video call|Phone call~Cloud|Hard drive~Wallpaper|Plain~QR code|Typed URL~Always notified|Do not disturb~Laptop|Tablet~E-reader|Paper~Rabbit hole|Focus mode" )},
 {id:"throwback",name:"Throwback Frequency",emoji:"📼",spectra:p("throwback","Cartoons|Morning errands~CD binder|Streaming queue~Arcade|Console~School dance|House party~Landline|Cell phone~Mixtape|Playlist~Mall|Main street~Stickers|Digital badges~Summer camp|Summer job~Yearbook|Photo dump~Disposable camera|Selfie~Video store|Streaming app~Roller rink|Bowling~Cartoon theme|Pop intro~Handwritten note|Voice memo~Sleepover|Group vacation~Local radio|Algorithm~Board game|Video game~Photo album|Camera roll~Backyard|Bedroom~Pizza party|Cookout~Comic book|Webtoon~Flip phone|Smart watch~After school|Midnight~Trick-or-treat|Costume party~Weekend chores|Weekend plans" )},
 {id:"wild",name:"Wild Cards",emoji:"🪐",spectra:p("wild","Useful power|Fun power~Dragon|Giant robot~Past travel|Future travel~Teleport|Fly~Mermaid|Astronaut~Secret lair|Treehouse~Alien friend|Ghost friend~Magic wand|Magic book~Talking animal|Tiny dinosaur~Strength|Speed~Underwater city|Sky city~Moon base|Jungle temple~Invisible|Mind reading~Treasure map|Mystery door~Cursed item|Lucky charm~Storm chaser|Deep diver~Space opera|Fairy tale~Portal|Puzzle box~Robot butler|Dragon chauffeur~Giant library|Giant kitchen~Winter forever|Summer forever~Perfect day|Surprise adventure~Glowing forest|Crystal cave~Wizard duel|Dance battle~Friendly monster|Mischief fairy~Ancient ruins|Future ruins~Cloud castle|Underground city~Magic mirror|Magic compass~One careful wish|One bold wish" )},
 {id:"work",name:"Work & Play",emoji:"🎯",spectra:p("work","Deep focus|Quick wins~Brainstorm|Execute~List|Wing it~Big picture|Detail~Office|Café~Early start|Late sprint~One task|Multitask~Sketch|Build~Immediate feedback|Time to reflect~Solo|Co-create~Presentation|Spreadsheet~Sticky notes|Whiteboard~Deadline|Inspiration~Promotion|Freedom~Long hours|Better systems~Inbox zero|Search later~Shortcut|Best practice~Prototype|Polish~Practice|Improvise~Expertise|Curiosity~Ambition|Balance~Mentor|Peer~Remote|In person~Meeting|Async~Perfect|Shipped~Plan ahead|Adapt as you go~Calendar block|To-do list~Sprint|Marathon~Idea|Execution" )},
 {id:"afterdark",name:"After Dark",emoji:"🌙",spectra:p("afterdark","Dance floor|Corner booth~Late dinner|Early dessert~Rooftop|Basement~Mocktail|Cocktail~Live DJ|Live band~Dress up|Comfortable~Stay out|Head home~Night drive|Night walk~Neon|Candlelight~Secrets|Stories~First date|Long-time love~Laugh loud|Speak low~Big gesture|Small detail~Busy bar|Quiet lounge~Spontaneous night|Quiet night~Dessert bar|Coffee shop~Movie night|Game night~City lights|Star lights~Last call|First train~Deep talk|Dumb jokes~Crowded room|Empty room~Mystery|Romance~Slow song|Fast song~Capture it|Live in it~Flirt|Tease~Fancy|Casual~Stay in|Go out~Midnight snack|Sunrise breakfast~Last one out|Leave on a high~New connection|Familiar comfort" )},
 {id:"naughty",name:"Naughty & Nice",emoji:"🍒",spectra:p("naughty",naughtyCards)}
];
