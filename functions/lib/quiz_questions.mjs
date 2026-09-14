// per_user_calendar_and_quiz_v1 / task-q04 — the 50-day quiz question bank.
//
// Hand-written, theologically-neutral, comprehension-level multiple-choice
// questions (basic factual recall: who / what / where / what happened) drawn
// strictly from each day's assigned chapters. 4-5 per day, one correct answer
// plus 2-3 plausible distractors.
//
// Design refinement vs the q01 note: the bank is a checked-in STATIC MODULE
// here in functions/lib (not a public/*.json) and is served via the API with
// the `answer` index stripped — a public JSON containing answers would be
// trivially readable by anyone. Grading happens server-side only.

// q = question text; options = answer choices; answer = index into options.
export const QUIZ_BANK = [
  { day: 1, reading: 'Matthew 1–6', questions: [
    { q: 'To whom was Mary pledged to be married when she was found to be expecting a child?', options: ['Joseph', 'Zechariah', 'Simeon'], answer: 0 },
    { q: 'To which country did Joseph flee with Mary and the child to escape Herod?', options: ['Egypt', 'Syria', 'Greece'], answer: 0 },
    { q: 'Where did John the Baptist preach and baptize?', options: ['The temple in Jerusalem', 'The wilderness of Judea', 'The streets of Nazareth'], answer: 1 },
    { q: 'In the Beatitudes, Jesus said "Blessed are the poor in spirit, for theirs is..."', options: ['the kingdom of heaven', 'the earth', 'comfort'], answer: 0 },
    { q: 'How many times did the devil tempt Jesus in the wilderness?', options: ['Once', 'Three times', 'Seven times'], answer: 1 },
  ]},
  { day: 2, reading: 'Matthew 7–12', questions: [
    { q: 'In Jesus\' parable, the wise man built his house on...', options: ['sand', 'a rock', 'a hilltop'], answer: 1 },
    { q: 'Whose servant did Jesus heal after being told "only say the word"?', options: ['A Roman centurion\'s', 'A synagogue ruler\'s', 'A Pharisee\'s'], answer: 0 },
    { q: 'What was Matthew doing when Jesus called him?', options: ['Mending fishing nets', 'Sitting at the tax booth', 'Working in a field'], answer: 1 },
    { q: 'When John the Baptist\'s disciples asked if Jesus was the one to come, Jesus pointed to...', options: ['his miracles of healing and the good news preached to the poor', 'the size of the crowds', 'his knowledge of the law'], answer: 0 },
    { q: 'Jesus said the only sign that would be given to that generation was the sign of...', options: ['Moses', 'Elijah', 'Jonah'], answer: 2 },
  ]},
  { day: 3, reading: 'Matthew 13–18', questions: [
    { q: 'In the parable of the sower, the seed on good soil stands for the person who...', options: ['hears the word and understands it', 'hears but soon falls away', 'is choked by wealth'], answer: 0 },
    { q: 'How many loaves and fish were used to feed the five thousand?', options: ['Seven loaves and a few fish', 'Five loaves and two fish', 'Twelve loaves and two fish'], answer: 1 },
    { q: 'Who walked on the water toward Jesus but began to sink?', options: ['James', 'Andrew', 'Peter'], answer: 2 },
    { q: 'Which two figures appeared with Jesus at the transfiguration?', options: ['Moses and Elijah', 'Abraham and Isaac', 'David and Isaiah'], answer: 0 },
    { q: 'Jesus said we should forgive a brother not seven times but...', options: ['ten times', 'seventy-seven times', 'three times'], answer: 1 },
  ]},
  { day: 4, reading: 'Matthew 19–24', questions: [
    { q: 'What did the rich young man ask Jesus?', options: ['What good deed must I do to have eternal life?', 'Who sinned, this man or his parents?', 'Where do you live?'], answer: 0 },
    { q: 'In the parable of the vineyard workers, the men hired at different hours all received...', options: ['payment by the hour', 'the same wage', 'double for overtime'], answer: 1 },
    { q: 'What animal did Jesus ride into Jerusalem?', options: ['A horse', 'A donkey', 'A camel'], answer: 1 },
    { q: 'Jesus taught, "Render to Caesar the things that are Caesar\'s, and to God..."', options: ['the things that are God\'s', 'the first fruits', 'the tithes'], answer: 0 },
    { q: 'Which commandment did Jesus name as the greatest?', options: ['Keep the Sabbath', 'Love the Lord your God with all your heart, soul and mind', 'Honor your father and mother'], answer: 1 },
  ]},
  { day: 5, reading: 'Matthew 25–28; Mark 1–2', questions: [
    { q: 'In the parable of the talents, what did the servant with one talent do with it?', options: ['Traded with it', 'Hid it in the ground', 'Gave it to the poor'], answer: 1 },
    { q: 'Who denied Jesus three times before the rooster crowed?', options: ['Judas', 'Peter', 'Thomas'], answer: 1 },
    { q: 'Who was compelled to carry Jesus\' cross?', options: ['Simon of Cyrene', 'Joseph of Arimathea', 'Nicodemus'], answer: 0 },
    { q: 'What did the women find when they arrived at Jesus\' tomb on the first day of the week?', options: ['The stone rolled away and the tomb empty', 'Roman guards still in place', 'The body wrapped in linen'], answer: 0 },
    { q: 'In Mark 2, how did the paralyzed man\'s friends get him to Jesus through the crowd?', options: ['They waited outside all night', 'They lowered him through the roof', 'They carried him through a window'], answer: 1 },
  ]},
  { day: 6, reading: 'Mark 3–8', questions: [
    { q: 'What name did the demon-possessed man in the region of the Gerasenes give?', options: ['Legion', 'Beelzebul', 'Belial'], answer: 0 },
    { q: 'Whose daughter did Jesus raise after saying "Talitha cumi" (Little girl, arise)?', options: ['A centurion\'s', 'Jairus the synagogue ruler\'s', 'A widow of Nain\'s'], answer: 1 },
    { q: 'With how many loaves did Jesus feed the four thousand?', options: ['Five', 'Seven', 'Twelve'], answer: 1 },
    { q: 'At Caesarea Philippi, how did Peter answer "Who do you say I am?"', options: ['You are a prophet', 'You are Elijah', 'You are the Christ'], answer: 2 },
    { q: 'When the storm threatened the boat, Jesus rebuked the wind and said...', options: ['"Peace! Be still!"', '"Why are you afraid?"', '"Where is your faith?"'], answer: 0 },
  ]},
  { day: 7, reading: 'Mark 9–14', questions: [
    { q: 'At the transfiguration, what happened to Jesus\' clothes?', options: ['They became dazzling white', 'They were torn', 'They glowed like fire'], answer: 0 },
    { q: 'What was the name of the blind beggar healed near Jericho?', options: ['Zacchaeus', 'Bartimaeus', 'Lazarus'], answer: 1 },
    { q: 'How many small coins did the poor widow put into the temple treasury?', options: ['One', 'Two', 'Ten'], answer: 1 },
    { q: 'In which garden did Jesus pray before his arrest?', options: ['Eden', 'Gethsemane', 'The garden of Joseph\'s tomb'], answer: 1 },
    { q: 'How did Judas signal to the crowd which man was Jesus?', options: ['He pointed from a distance', 'He kissed him', 'He called his name'], answer: 1 },
  ]},
  { day: 8, reading: 'Mark 15–16; Luke 1–4', questions: [
    { q: 'Which prisoner did the crowd ask Pilate to release instead of Jesus?', options: ['Barabbas', 'Bartholomew', 'Barnabas'], answer: 0 },
    { q: 'What happened in the temple at the moment Jesus died?', options: ['The curtain was torn in two', 'The lamps went out', 'An earthquake opened the doors'], answer: 0 },
    { q: 'Which angel appeared to Zechariah and later to Mary in Luke 1?', options: ['Michael', 'Raphael', 'Gabriel'], answer: 2 },
    { q: 'What did the angel announce to the shepherds?', options: ['A Savior, Christ the Lord, born in the city of David', 'The end of the Roman occupation', 'The birth of John the Baptist'], answer: 0 },
    { q: 'In the wilderness, Jesus answered each of the devil\'s temptations by...', options: ['quoting Scripture', 'performing a sign', 'remaining silent'], answer: 0 },
  ]},
  { day: 9, reading: 'Luke 5–10', questions: [
    { q: 'After the miraculous catch of fish, Peter fell at Jesus\' knees and said...', options: ['"Depart from me, for I am a sinful man, O Lord"', '"Truly you are the Son of God"', '"Lord, save me"'], answer: 0 },
    { q: 'In which town did Jesus raise a widow\'s only son?', options: ['Capernaum', 'Nain', 'Bethlehem'], answer: 1 },
    { q: 'In the parable of the good Samaritan, who passed the injured man first?', options: ['A Levite', 'A merchant', 'A priest'], answer: 2 },
    { q: 'When Martha complained about serving alone, Jesus said Mary had chosen...', options: ['the easy way out', 'the good portion, which will not be taken away from her', 'to sit at his feet idly'], answer: 1 },
    { q: 'How many workers did Jesus send out ahead of him in Luke 10?', options: ['Twelve', 'Forty', 'Seventy-two'], answer: 2 },
  ]},
  { day: 10, reading: 'Luke 11–16', questions: [
    { q: 'When Jesus taught the disciples to pray, the prayer began...', options: ['"Father, hallowed be your name"', '"Our Rock and our Redeemer"', '"Hear, O Israel"'], answer: 0 },
    { q: 'What did the rich fool decide to do with his abundant harvest?', options: ['Sell it and give to the poor', 'Build bigger barns to store it', 'Divide it among his sons'], answer: 1 },
    { q: 'When the prodigal son returned, what did his father do?', options: ['Made him a hired servant', 'Ran to him, embraced him and ordered a feast', 'Sent him to the fields'], answer: 1 },
    { q: 'In the parable, what was the name of the beggar at the rich man\'s gate?', options: ['Lazarus', 'Eleazar', 'Zacchaeus'], answer: 0 },
    { q: 'In the parable, the shepherd left how many sheep to search for the one that was lost?', options: ['Nine', 'Ninety-nine', 'Fifty'], answer: 1 },
  ]},
  { day: 11, reading: 'Luke 17–21', questions: [
    { q: 'Of the ten lepers Jesus healed, how many returned to thank him?', options: ['All ten', 'Five', 'One'], answer: 2 },
    { q: 'In the parable, the tax collector prayed...', options: ['"God, I thank you that I am not like other men"', '"God, be merciful to me, a sinner"', '"Lord, remember my fasting"'], answer: 1 },
    { q: 'What kind of tree did Zacchaeus climb to see Jesus?', options: ['A fig tree', 'A sycamore tree', 'An olive tree'], answer: 1 },
    { q: 'Zacchaeus promised to repay anyone he had defrauded...', options: ['double', 'four times as much', 'with a tenth added'], answer: 1 },
    { q: 'Jesus said the poor widow who gave two coins had given...', options: ['less than the others', 'exactly her tithe', 'more than all the others, out of her poverty'], answer: 2 },
  ]},
  { day: 12, reading: 'Luke 22–24; John 1–2', questions: [
    { q: 'At the Last Supper, Jesus said the cup was the new covenant in...', options: ['his blood', 'water and wine', 'the promises of Moses'], answer: 0 },
    { q: 'To which ruler did Pilate send Jesus, who happened to be in Jerusalem?', options: ['Herod', 'Caiaphas', 'Felix'], answer: 0 },
    { q: 'When did the two disciples on the road to Emmaus finally recognize Jesus?', options: ['When he opened the Scriptures', 'When he broke the bread', 'When he joined them on the road'], answer: 1 },
    { q: 'In John 1, what did John the Baptist call Jesus?', options: ['The Lamb of God', 'The Lion of Judah', 'The Good Shepherd'], answer: 0 },
    { q: 'At the wedding in Cana, Jesus turned water into...', options: ['milk', 'wine', 'oil'], answer: 1 },
  ]},
  { day: 13, reading: 'John 3–7', questions: [
    { q: 'When did Nicodemus come to speak with Jesus?', options: ['At dawn', 'At night', 'On the Sabbath'], answer: 1 },
    { q: 'Jesus told the Samaritan woman at the well that he could give...', options: ['living water', 'an easy yoke', 'a new family'], answer: 0 },
    { q: 'How many baskets of leftovers were gathered after Jesus fed the five thousand?', options: ['Seven', 'Ten', 'Twelve'], answer: 2 },
    { q: 'Jesus declared, "I am the bread of..."', options: ['heaven', 'life', 'the covenant'], answer: 1 },
    { q: 'At the Feast of Tabernacles, Jesus invited anyone who thirsts to come to him and...', options: ['drink', 'eat', 'rest'], answer: 0 },
  ]},
  { day: 14, reading: 'John 8–12', questions: [
    { q: 'To the woman caught in adultery, Jesus said...', options: ['"Neither do I condemn you; go, and sin no more"', '"Where is your husband?"', '"The law requires stoning"'], answer: 0 },
    { q: 'Jesus said, "I am the light of the..."', options: ['temple', 'world', 'nations'], answer: 1 },
    { q: 'The man born blind was told to wash in the pool of...', options: ['Bethesda', 'Siloam', 'Gihon'], answer: 1 },
    { q: 'How long had Lazarus been in the tomb before Jesus raised him?', options: ['One day', 'Two days', 'Four days'], answer: 2 },
    { q: 'Who anointed Jesus\' feet with expensive perfume and wiped them with her hair?', options: ['Mary of Bethany', 'Mary Magdalene', 'Martha'], answer: 0 },
  ]},
  { day: 15, reading: 'John 13–17', questions: [
    { q: 'During the meal, what did Jesus do for his disciples?', options: ['Washed their feet', 'Anointed their heads', 'Served them bread alone'], answer: 0 },
    { q: 'Jesus\' new commandment was that his disciples...', options: ['fast twice a week', 'love one another as he had loved them', 'keep every tradition'], answer: 1 },
    { q: 'Jesus said, "I am the way, and the truth, and the..."', options: ['light', 'door', 'life'], answer: 2 },
    { q: 'Jesus described himself as the true...', options: ['shepherd only', 'vine', 'cornerstone'], answer: 1 },
    { q: 'In his prayer, Jesus asked the Father to sanctify the disciples in the truth, adding...', options: ['"your word is truth"', '"the law is truth"', '"I am the truth alone"'], answer: 0 },
  ]},
  { day: 16, reading: 'John 18–21; Acts 1', questions: [
    { q: 'What did Peter do when Jesus was arrested?', options: ['Ran away immediately', 'Cut off the ear of the high priest\'s servant', 'Called down fire'], answer: 1 },
    { q: 'What inscription did Pilate place on the cross?', options: ['Jesus of Nazareth, the King of the Jews', 'He saved others; he cannot save himself', 'King of Israel'], answer: 0 },
    { q: 'Jesus\' final word from the cross in John\'s Gospel is...', options: ['"It is finished"', '"Father, forgive them"', '"My God, my God, why have you forsaken me?"'], answer: 0 },
    { q: 'Which disciple said he would not believe unless he touched Jesus\' wounds?', options: ['Peter', 'Thomas', 'Philip'], answer: 1 },
    { q: 'Who was chosen by lot to take Judas\' place among the twelve?', options: ['Barsabbas', 'Matthias', 'Stephen'], answer: 1 },
  ]},
  { day: 17, reading: 'Acts 2–6', questions: [
    { q: 'At Pentecost, what accompanied the coming of the Holy Spirit?', options: ['A sound like a mighty rushing wind and tongues of fire', 'An earthquake and darkness', 'Rain after three years'], answer: 0 },
    { q: 'About how many were added to the believers after Peter\'s Pentecost sermon?', options: ['One hundred and twenty', 'Five hundred', 'Three thousand'], answer: 2 },
    { q: 'At the temple gate called Beautiful, Peter healed a man who had been...', options: ['blind from birth', 'lame from birth', 'deaf and mute'], answer: 1 },
    { q: 'What did Ananias and Sapphira lie about?', options: ['Their prayer life', 'The price of the property they sold', 'Their fasting'], answer: 1 },
    { q: 'The seven men were chosen so that the apostles could devote themselves to...', options: ['prayer and the ministry of the word', 'overseeing the daily distribution', 'traveling to new cities'], answer: 0 },
  ]},
  { day: 18, reading: 'Acts 7–11', questions: [
    { q: 'As he was being stoned, Stephen prayed...', options: ['"Lord, do not hold this sin against them"', '"Lord, avenge my blood"', '"Lord, take me home in peace"'], answer: 0 },
    { q: 'Who was Philip directed to meet on the desert road to Gaza?', options: ['A Roman centurion', 'An Ethiopian official in a chariot', 'A group of Greek pilgrims'], answer: 1 },
    { q: 'On the road to Damascus, Saul heard a voice saying...', options: ['"Saul, Saul, why are you persecuting me?"', '"Saul, turn back from this city"', '"Rise and be baptized"'], answer: 0 },
    { q: 'In Joppa, Peter raised from the dead a woman named...', options: ['Priscilla', 'Lydia', 'Tabitha (Dorcas)'], answer: 2 },
    { q: 'Where were the disciples first called "Christians"?', options: ['Jerusalem', 'Antioch', 'Rome'], answer: 1 },
  ]},
  { day: 19, reading: 'Acts 12–16', questions: [
    { q: 'While the church prayed, how did Peter escape from prison?', options: ['An earthquake opened the doors', 'An angel led him out past the guards', 'The guards fell asleep'], answer: 1 },
    { q: 'At the Jerusalem Council, Peter declared that Jew and Gentile alike are saved...', options: ['through the grace of the Lord Jesus', 'by keeping the law of Moses', 'through circumcision'], answer: 0 },
    { q: 'In Lystra, the crowds thought Barnabas and Paul were...', options: ['angels', 'gods — Zeus and Hermes', 'prophets of the emperor'], answer: 1 },
    { q: 'What vision led Paul to cross over into Macedonia?', options: ['A man of Macedonia pleading, "Come over and help us"', 'A sheet let down from heaven', 'A door standing open'], answer: 0 },
    { q: 'In Philippi, Lydia was a dealer in...', options: ['fine linen', 'purple cloth', 'olive oil'], answer: 1 },
  ]},
  { day: 20, reading: 'Acts 17–21', questions: [
    { q: 'The Bereans were commended because they...', options: ['received Paul with a parade', 'examined the Scriptures daily to see if these things were so', 'built Paul a house'], answer: 1 },
    { q: 'In Athens, Paul noticed an altar inscribed...', options: ['"To the unknown god"', '"To Caesar, lord of all"', '"To the god of Abraham"'], answer: 0 },
    { q: 'Who stirred up the riot in Ephesus over lost business in idols?', options: ['Gallio the proconsul', 'Demetrius the silversmith', 'Apollos'], answer: 1 },
    { q: 'What happened to Eutychus while Paul preached late into the night at Troas?', options: ['He fell asleep, fell from the third story, and was taken up dead — then restored', 'He was arrested', 'He fell ill with fever'], answer: 0 },
    { q: 'Which prophet bound his own hands and feet with Paul\'s belt to show what awaited Paul in Jerusalem?', options: ['Philip', 'Agabus', 'Barnabas'], answer: 1 },
  ]},
  { day: 21, reading: 'Acts 22–26', questions: [
    { q: 'Speaking to the Jerusalem crowd, Paul said he had been trained at the feet of...', options: ['Gamaliel', 'Caiaphas', 'Hillel the Elder'], answer: 0 },
    { q: 'Paul divided the Sanhedrin by declaring that he was on trial for...', options: ['his Roman citizenship', 'the hope of the resurrection of the dead', 'breaking the Sabbath'], answer: 1 },
    { q: 'How did Paul learn about the ambush planned against him?', options: ['A centurion warned him', 'His nephew heard of the plot and reported it', 'Felix received a letter'], answer: 1 },
    { q: 'Which governor kept Paul in custody in Caesarea, hoping for a bribe?', options: ['Festus', 'Felix', 'Agrippa'], answer: 1 },
    { q: 'To avoid being sent back to Jerusalem, Paul formally declared...', options: ['"I appeal to Caesar"', '"I demand a trial in Antioch"', '"I appeal to the Sanhedrin"'], answer: 0 },
  ]},
  { day: 22, reading: 'Acts 27–28; Romans 1–3', questions: [
    { q: 'About how many people were on board the ship that was wrecked on the way to Rome?', options: ['76', '176', '276'], answer: 2 },
    { q: 'On Malta, what happened when a viper fastened itself on Paul\'s hand?', options: ['He shook it off into the fire and suffered no harm', 'His hand swelled but healed by morning', 'The islanders killed it with sticks'], answer: 0 },
    { q: 'Paul wrote that he was not ashamed of the gospel, for it is...', options: ['a light to the nations', 'the power of God for salvation to everyone who believes', 'wisdom for the wise'], answer: 1 },
    { q: '"All have sinned and fall short of..."', options: ['the glory of God', 'the law of Moses', 'their own conscience'], answer: 0 },
    { q: 'In Rome, Paul proclaimed the kingdom of God...', options: ['in the temple courts', 'in his own rented house, welcoming all who came', 'in the forum each Sabbath'], answer: 1 },
  ]},
  { day: 23, reading: 'Romans 4–8', questions: [
    { q: 'In Romans 4, Abraham believed God, and it was counted to him as...', options: ['wisdom', 'righteousness', 'merit'], answer: 1 },
    { q: 'Paul wrote that sin entered the world through...', options: ['one man, Adam', 'the law', 'the serpent\'s curse on Israel'], answer: 0 },
    { q: 'Paul confesses, "I do not do what I want, but I do..."', options: ['what the law commands', 'the very thing I hate', 'what others expect'], answer: 1 },
    { q: '"There is therefore now no condemnation for those who are in..."', options: ['Christ Jesus', 'the covenant of Abraham', 'good standing with the law'], answer: 0 },
    { q: 'Paul concludes that nothing in all creation can separate us from...', options: ['the hope of glory', 'the love of God in Christ Jesus', 'the fellowship of believers'], answer: 1 },
  ]},
  { day: 24, reading: 'Romans 9–13', questions: [
    { q: '"Everyone who calls on the name of the Lord will be..."', options: ['saved', 'heard', 'blessed'], answer: 0 },
    { q: 'Paul urges believers to present their bodies as...', options: ['a living sacrifice, holy and acceptable to God', 'an offering on the Sabbath', 'a temple tax'], answer: 0 },
    { q: '"Let love be..."', options: ['patient with all', 'genuine', 'shown on feast days'], answer: 1 },
    { q: 'Paul says to be subject to the governing authorities because...', options: ['they are always just', 'there is no authority except from God', 'Caesar is a believer'], answer: 1 },
    { q: '"Love does no wrong to a neighbor; therefore love is..."', options: ['the fulfilling of the law', 'better than sacrifice', 'the root of all blessing'], answer: 0 },
  ]},
  { day: 25, reading: 'Romans 14–16; 1 Corinthians 1–2', questions: [
    { q: 'Paul tells the Romans to welcome those weak in faith, but not to quarrel over...', options: ['opinions', 'offerings', 'the Scriptures'], answer: 0 },
    { q: '"The kingdom of God is not a matter of eating and drinking but of..."', options: ['fasting and prayer', 'righteousness, peace and joy in the Holy Spirit', 'sabbaths and festivals'], answer: 1 },
    { q: 'Which woman does Paul commend as a servant (deacon) of the church at Cenchreae?', options: ['Prisca', 'Phoebe', 'Junia'], answer: 1 },
    { q: 'In Corinth, some believers were saying "I follow Paul," and others...', options: ['"I follow Apollos" or "I follow Cephas"', '"I follow no one"', '"I follow Moses"'], answer: 0 },
    { q: 'Paul decided to know nothing among the Corinthians except...', options: ['wisdom and eloquence', 'Jesus Christ and him crucified', 'the law and the prophets'], answer: 1 },
  ]},
  { day: 26, reading: '1 Corinthians 3–7', questions: [
    { q: 'Paul says the Corinthians are God\'s field and God\'s...', options: ['building', 'vineyard', 'flock'], answer: 0 },
    { q: '"Do you not know that your body is a temple of..."', options: ['the law', 'the Holy Spirit', 'wisdom'], answer: 1 },
    { q: 'Paul asks why believers take their disputes before...', options: ['unbelievers\' courts instead of the saints', 'the elders of Jerusalem', 'Roman soldiers'], answer: 0 },
    { q: 'Writing about marriage, Paul says that because of temptation each man should have...', options: ['his own wife, and each woman her own husband', 'an elder\'s permission first', 'a season of fasting'], answer: 0 },
    { q: 'Paul\'s general rule is that each person should remain in the condition in which...', options: ['he is most comfortable', 'he was called', 'he can earn the most'], answer: 1 },
  ]},
  { day: 27, reading: '1 Corinthians 8–12', questions: [
    { q: '"Knowledge puffs up, but..."', options: ['love builds up', 'wisdom humbles', 'faith sustains'], answer: 0 },
    { q: 'Paul says he has become all things to all people so that...', options: ['he might win their approval', 'he might save some', 'he might avoid conflict'], answer: 1 },
    { q: '"No temptation has overtaken you that is not common to man; God is faithful and will provide..."', options: ['a way of escape', 'a season of relief', 'stronger willpower'], answer: 0 },
    { q: 'Paul compares the church to...', options: ['one body with many members', 'a city on a hill', 'an army in formation'], answer: 0 },
    { q: 'The varieties of spiritual gifts are all empowered by...', options: ['human effort', 'one and the same Spirit', 'the apostles\' teaching'], answer: 1 },
  ]},
  { day: 28, reading: '1 Corinthians 13–16; 2 Corinthians 1', questions: [
    { q: '"If I speak in the tongues of men and of angels, but have not love, I am..."', options: ['nothing at all', 'a noisy gong or a clanging cymbal', 'like a cloud without rain'], answer: 1 },
    { q: 'Of faith, hope and love, Paul says the greatest is...', options: ['faith', 'hope', 'love'], answer: 2 },
    { q: '"If Christ has not been raised, your faith is..."', options: ['in vain', 'still admirable', 'a private matter'], answer: 0 },
    { q: 'Paul taunts, "O death, where is your..."', options: ['sting?', 'shadow?', 'power over the righteous?'], answer: 0 },
    { q: 'In 2 Corinthians 1, Paul calls God "the Father of mercies and God of all..."', options: ['grace', 'comfort', 'peace'], answer: 1 },
  ]},
  { day: 29, reading: '2 Corinthians 2–6', questions: [
    { q: 'Paul says God always leads us in...', options: ['triumphal procession in Christ', 'quietness and safety', 'paths of prosperity'], answer: 0 },
    { q: 'Believers are like a letter from Christ, written not with ink but with...', options: ['the blood of the covenant', 'the Spirit of the living God', 'gold on parchment'], answer: 1 },
    { q: '"We have this treasure in..."', options: ['the temple archives', 'jars of clay', 'storehouses of heaven'], answer: 1 },
    { q: '"If anyone is in Christ, he is..."', options: ['a new creation', 'bound to the old covenant', 'free from all suffering'], answer: 0 },
    { q: 'God gave us the ministry of...', options: ['reconciliation', 'judgment', 'temple service'], answer: 0 },
  ]},
  { day: 30, reading: '2 Corinthians 7–11', questions: [
    { q: '"Godly grief produces a repentance that leads to..."', options: ['salvation without regret', 'deeper sorrow', 'public shame'], answer: 0 },
    { q: '"God loves a..."', options: ['disciplined giver', 'cheerful giver', 'wealthy giver'], answer: 1 },
    { q: 'The Macedonian churches gave generously even though they were in...', options: ['a severe test of affliction and extreme poverty', 'a season of prosperity', 'a dispute with Paul'], answer: 0 },
    { q: 'Paul insists that the one who boasts should boast in...', options: ['his visions', 'the Lord', 'his heritage'], answer: 1 },
    { q: 'In his list of hardships, Paul says he was shipwrecked...', options: ['once', 'twice', 'three times'], answer: 2 },
  ]},
  { day: 31, reading: '2 Corinthians 12–13; Galatians 1–3', questions: [
    { q: 'When Paul pleaded about his "thorn in the flesh," the Lord answered...', options: ['"My grace is sufficient for you"', '"Ask once more"', '"This I will not remove"'], answer: 0 },
    { q: 'How many times did Paul plead with the Lord to take the thorn away?', options: ['Once', 'Three times', 'Seven times'], answer: 1 },
    { q: 'In Antioch, Paul confronted Peter because Peter had...', options: ['preached a different gospel', 'drawn back from eating with Gentiles out of fear', 'refused to baptize'], answer: 1 },
    { q: '"I have been crucified with Christ. It is no longer I who live, but..."', options: ['Christ who lives in me', 'the Spirit who teaches me', 'grace that carries me'], answer: 0 },
    { q: 'Paul says the law served as our...', options: ['guardian until Christ came', 'enemy forever', 'reward in heaven'], answer: 0 },
  ]},
  { day: 32, reading: 'Galatians 4–6; Ephesians 1–2', questions: [
    { q: 'The first fruit of the Spirit Paul names is...', options: ['joy', 'love', 'peace'], answer: 1 },
    { q: '"Do not be deceived: God is not mocked, for whatever one sows, that will he also..."', options: ['reap', 'answer for', 'be forgiven of'], answer: 0 },
    { q: 'Ephesians 1 says believers were chosen in Christ before...', options: ['the foundation of the world', 'the giving of the law', 'their baptism'], answer: 0 },
    { q: '"For by grace you have been saved through..."', options: ['works', 'faith', 'the law'], answer: 1 },
    { q: 'Paul says we were all once dead in...', options: ['ignorance', 'trespasses and sins', 'poverty of spirit'], answer: 1 },
  ]},
  { day: 33, reading: 'Ephesians 3–6; Philippians 1', questions: [
    { q: 'Paul prays that the Ephesians would be strengthened with power through the Spirit in...', options: ['their inner being', 'their assemblies', 'their giving'], answer: 0 },
    { q: 'Paul writes that there is one body, one Spirit, one Lord, one faith and one...', options: ['baptism', 'temple', 'offering'], answer: 0 },
    { q: 'In the armor of God, the shield is the shield of...', options: ['truth', 'faith', 'salvation'], answer: 1 },
    { q: 'The sword of the Spirit is...', options: ['the word of God', 'righteousness', 'the gospel of peace'], answer: 0 },
    { q: 'Writing from prison, Paul says, "For to me to live is Christ, and to die is..."', options: ['loss', 'rest', 'gain'], answer: 2 },
  ]},
  { day: 34, reading: 'Philippians 2–4; Colossians 1–2', questions: [
    { q: 'The hymn in Philippians 2 says every knee will bow and every tongue confess that...', options: ['Jesus Christ is Lord', 'God is one', 'the kingdom has come'], answer: 0 },
    { q: 'Paul says he counts everything as loss compared to...', options: ['the glory to come', 'knowing Christ Jesus his Lord', 'the resurrection'], answer: 1 },
    { q: '"Rejoice in the Lord..."', options: ['in good seasons', 'always', 'with singing'], answer: 1 },
    { q: '"I can do all things through..."', options: ['him who strengthens me', 'discipline and fasting', 'the prayers of the saints'], answer: 0 },
    { q: 'Colossians describes Christ as the image of...', options: ['the invisible God', 'perfect humanity', 'the heavenly temple'], answer: 0 },
  ]},
  { day: 35, reading: 'Colossians 3–4; 1 Thessalonians 1–3', questions: [
    { q: '"Set your minds on things that are..."', options: ['noble and pure', 'above, not on things that are on earth', 'pleasing to others'], answer: 1 },
    { q: 'Paul says, whatever you do, work heartily, as for...', options: ['the Lord and not for men', 'your household', 'the church treasury'], answer: 0 },
    { q: 'Paul urges that our speech always be gracious, seasoned with...', options: ['honey', 'salt', 'oil'], answer: 1 },
    { q: 'Paul recalls that the Thessalonians turned to God from...', options: ['idols, to serve the living and true God', 'the law of Moses', 'the synagogue rulers'], answer: 0 },
    { q: 'Paul sent Timothy to Thessalonica to...', options: ['collect the offering', 'establish and encourage them in their faith', 'rebuke the false teachers'], answer: 1 },
  ]},
  { day: 36, reading: '1 Thessalonians 4–5; 2 Thessalonians 1–3', questions: [
    { q: 'Paul writes that God\'s will for the Thessalonians is their...', options: ['prosperity', 'sanctification', 'comfort'], answer: 1 },
    { q: 'Paul says the Lord will descend from heaven with a cry of command, the voice of an archangel and...', options: ['the sound of the trumpet of God', 'ten thousand angels', 'fire and smoke'], answer: 0 },
    { q: '"Pray without..."', options: ['ceasing', 'worrying', 'doubting'], answer: 0 },
    { q: 'In 2 Thessalonians, Paul says the day of the Lord will not come unless...', options: ['the gospel reaches Rome', 'the rebellion comes first and the man of lawlessness is revealed', 'the temple is rebuilt'], answer: 1 },
    { q: 'Paul\'s command about idleness: "If anyone is not willing to work, let him not..."', options: ['eat', 'sleep', 'speak in the assembly'], answer: 0 },
  ]},
  { day: 37, reading: '1 Timothy 1–5', questions: [
    { q: 'Paul calls himself the foremost of...', options: ['apostles', 'sinners', 'sufferers'], answer: 1 },
    { q: '"Christ Jesus came into the world to save..."', options: ['the righteous', 'Israel', 'sinners'], answer: 2 },
    { q: 'An overseer, Paul writes, must be...', options: ['above reproach', 'wealthy and generous', 'a fluent speaker'], answer: 0 },
    { q: '"Great is the mystery of godliness: He was manifested in the..."', options: ['flesh', 'temple', 'heavens'], answer: 0 },
    { q: 'Paul tells Timothy that bodily training is of some value, but to train himself for...', options: ['eldership', 'godliness', 'debate'], answer: 1 },
  ]},
  { day: 38, reading: '1 Timothy 6; 2 Timothy 1–4', questions: [
    { q: '"The love of money is a root of..."', options: ['all kinds of evils', 'generosity', 'worldly security'], answer: 0 },
    { q: 'Paul reminds Timothy that God gave us a spirit not of fear but of...', options: ['power, love and self-control', 'boldness in debate', 'joy and peace'], answer: 0 },
    { q: '"All Scripture is breathed out by God and profitable for..."', options: ['teaching, reproof, correction and training in righteousness', 'settling genealogies', 'blessing the household'], answer: 0 },
    { q: '"Preach the word; be ready..."', options: ['in season and out of season', 'when doors open', 'with many proofs'], answer: 0 },
    { q: 'Near the end, Paul writes, "I have fought the good fight, I have finished the..."', options: ['work', 'race', 'course of fasting'], answer: 1 },
  ]},
  { day: 39, reading: 'Titus 1–3; Philemon; Hebrews 1', questions: [
    { q: 'Paul left Titus in Crete to...', options: ['collect the famine relief', 'put what remained into order and appoint elders in every town', 'plant a synagogue'], answer: 1 },
    { q: 'Paul\'s letter to Philemon appeals on behalf of...', options: ['Onesimus, a runaway slave', 'Epaphras, a fellow prisoner', 'Tychicus, a courier'], answer: 0 },
    { q: 'Paul plays on Onesimus\' name, saying he was once "useless" but is now...', options: ['"useful" to both of them', 'a free man', 'a deacon'], answer: 0 },
    { q: 'Hebrews opens by saying that in these last days God has spoken to us by...', options: ['his Son', 'angels', 'the prophets'], answer: 0 },
    { q: 'The Son is described as the radiance of God\'s glory and the exact...', options: ['likeness of Adam', 'imprint of his nature', 'copy of the law'], answer: 1 },
  ]},
  { day: 40, reading: 'Hebrews 2–6', questions: [
    { q: 'Hebrews warns us to pay much closer attention to what we have heard, lest we...', options: ['drift away from it', 'grow proud of it', 'keep it to ourselves'], answer: 0 },
    { q: 'Jesus was made for a little while lower than...', options: ['the angels', 'the prophets', 'Moses'], answer: 0 },
    { q: 'We have a high priest able to sympathize with our weaknesses, one tempted in every respect, yet without...', options: ['fear', 'sin', 'limits'], answer: 1 },
    { q: 'The word of God is living and active, sharper than...', options: ['any two-edged sword', 'a double battle-axe', 'a flint knife'], answer: 0 },
    { q: 'Hebrews calls the hope set before us a sure and steadfast...', options: ['anchor of the soul', 'rock of the heart', 'shield of the mind'], answer: 0 },
  ]},
  { day: 41, reading: 'Hebrews 7–11', questions: [
    { q: 'Melchizedek was king of Salem and priest of...', options: ['God Most High', 'the temple of Baal', 'the synagogue'], answer: 0 },
    { q: '"Without the shedding of blood there is no..."', options: ['forgiveness of sins', 'covenant meal', 'priestly blessing'], answer: 0 },
    { q: 'Christ entered once for all into the holy places by means of...', options: ['the blood of goats and calves', 'his own blood', 'the prayers of the saints'], answer: 1 },
    { q: '"Now faith is the assurance of things hoped for, the conviction of..."', options: ['things not seen', 'the promises to Moses', 'our good conscience'], answer: 0 },
    { q: 'By faith, Abraham obeyed when he was called to go out to a place...', options: ['where his fathers had lived', 'he was to receive as an inheritance', 'of flowing milk and honey nearby'], answer: 1 },
  ]},
  { day: 42, reading: 'Hebrews 12–13; James 1–3', questions: [
    { q: '"Let us run with endurance the race set before us, looking to..."', options: ['the cloud of witnesses', 'Jesus, the founder and perfecter of our faith', 'the finish line'], answer: 1 },
    { q: '"Jesus Christ is the same yesterday and today and..."', options: ['forever', 'for all nations', 'to the end of the age'], answer: 0 },
    { q: 'James says to count it all joy when you meet...', options: ['prosperity and ease', 'trials of various kinds', 'fellow believers'], answer: 1 },
    { q: '"Be doers of the word, and not..."', options: ['hearers only', 'proud of it', 'slow to speak only'], answer: 0 },
    { q: 'James compares the tongue to a small fire that can set ablaze...', options: ['a great forest', 'an altar', 'a city gate'], answer: 0 },
  ]},
  { day: 43, reading: 'James 4–5; 1 Peter 1–3', questions: [
    { q: '"Resist the devil, and he will..."', options: ['flee from you', 'attack harder', 'bargain with you'], answer: 0 },
    { q: 'James says the prayer of a righteous person has great...', options: ['power as it is working', 'beauty before men', 'length in heaven'], answer: 0 },
    { q: 'James points to which prophet, who prayed fervently that it might not rain?', options: ['Elisha', 'Elijah', 'Jeremiah'], answer: 1 },
    { q: 'Peter says believers have been born again to a living hope through...', options: ['the resurrection of Jesus Christ from the dead', 'the washing of baptism alone', 'their perseverance'], answer: 0 },
    { q: 'Believers are called "a royal priesthood, a holy..."', options: ['nation', 'temple', 'priesthood of kings'], answer: 0 },
  ]},
  { day: 44, reading: '1 Peter 4–5; 2 Peter 1–3', questions: [
    { q: '"Cast all your anxieties on him, because he..."', options: ['cares for you', 'judges fairly', 'rewards endurance'], answer: 0 },
    { q: 'Peter warns that the devil prowls around like...', options: ['a roaring lion, seeking someone to devour', 'a serpent in the grass', 'a thief at midnight'], answer: 0 },
    { q: 'Elders are to shepherd the flock of God...', options: ['under compulsion', 'willingly, as God would have them', 'for shameful gain'], answer: 1 },
    { q: 'Peter writes that with the Lord one day is as...', options: ['a thousand years, and a thousand years as one day', 'a watch in the night', 'the blink of an eye'], answer: 0 },
    { q: 'According to his promise, we wait for new heavens and a new earth in which...', options: ['righteousness dwells', 'sorrow hides', 'nations war no more only'], answer: 0 },
  ]},
  { day: 45, reading: '1 John 1–5', questions: [
    { q: '"If we confess our sins, he is faithful and just to..."', options: ['forgive us our sins and cleanse us from all unrighteousness', 'remember our devotion', 'lighten our burdens'], answer: 0 },
    { q: 'John declares that God is...', options: ['light, and in him is no darkness at all', 'a consuming fire only', 'unknowable'], answer: 0 },
    { q: 'John warns his readers not to love...', options: ['the world or the things in the world', 'their brothers too little', 'the Scriptures only'], answer: 0 },
    { q: '"There is no fear in love, but perfect love casts out..."', options: ['doubt', 'fear', 'shame'], answer: 1 },
    { q: 'John writes that everyone who believes that Jesus is the Christ has been...', options: ['born of God', 'baptized with fire', 'sealed by angels'], answer: 0 },
  ]},
  { day: 46, reading: '2 John; 3 John; Jude; Revelation 1–2', questions: [
    { q: 'John writes to Gaius that he has no greater joy than to hear that his children are walking in...', options: ['the truth', 'unity', 'peace'], answer: 0 },
    { q: 'In 3 John, who is named as one who "likes to put himself first"?', options: ['Demetrius', 'Diotrephes', 'Gaius'], answer: 1 },
    { q: 'Jude urges his readers to contend for the faith that was once for all delivered to...', options: ['the apostles', 'the saints', 'the churches of Asia'], answer: 1 },
    { q: 'On which island was John when he received the Revelation?', options: ['Crete', 'Cyprus', 'Patmos'], answer: 2 },
    { q: 'The church in Ephesus is rebuked for abandoning...', options: ['the love they had at first', 'the poor among them', 'the Sabbath assembly'], answer: 0 },
  ]},
  { day: 47, reading: 'Revelation 3–7', questions: [
    { q: 'The Laodicean church is rebuked for being neither cold nor hot but...', options: ['lukewarm', 'worldly', 'divided'], answer: 0 },
    { q: 'Around the throne in heaven sat how many elders?', options: ['Seven', 'Twelve', 'Twenty-four'], answer: 2 },
    { q: 'Who alone was found worthy to open the scroll and its seals?', options: ['The Lamb who was slain', 'The archangel Michael', 'The eldest of the elders'], answer: 0 },
    { q: 'The great multitude before the throne were clothed in white robes, with...', options: ['palm branches in their hands', 'crowns of gold', 'harps and bowls'], answer: 0 },
    { q: 'How many were sealed out of the tribes of Israel?', options: ['12,000', '70,000', '144,000'], answer: 2 },
  ]},
  { day: 48, reading: 'Revelation 8–12', questions: [
    { q: 'When the seventh seal was opened, there was silence in heaven for about...', options: ['half an hour', 'three days', 'a thousand years'], answer: 0 },
    { q: 'The great star that fell from heaven and made the waters bitter was called...', options: ['Abaddon', 'Wormwood', 'Apollyon'], answer: 1 },
    { q: 'The two witnesses prophesied, clothed in sackcloth, for...', options: ['forty days', '1,260 days', 'three and a half years of silence'], answer: 1 },
    { q: 'The great dragon thrown down is identified as...', options: ['that ancient serpent, the devil and Satan', 'the beast from the sea', 'the king of Babylon'], answer: 0 },
    { q: 'Who and his angels fought against the dragon in heaven?', options: ['Gabriel', 'Michael', 'Raphael'], answer: 1 },
  ]},
  { day: 49, reading: 'Revelation 13–17', questions: [
    { q: 'The second beast causes all to be marked on...', options: ['the right hand or the forehead', 'the shoulder', 'the doorway'], answer: 0 },
    { q: 'The number of the beast is...', options: ['616', '666', '777'], answer: 1 },
    { q: 'The seven bowls of God\'s wrath are poured out by...', options: ['seven angels', 'the four living creatures', 'the elders'], answer: 0 },
    { q: 'The kings of the earth assemble for battle at the place called in Hebrew...', options: ['Megiddo', 'Armageddon', 'Golgotha'], answer: 1 },
    { q: 'Written on the forehead of the woman seated on the beast was the name of mystery...', options: ['"Babylon the great"', '"Mother of harlots" only', '"Rome eternal"'], answer: 0 },
  ]},
  { day: 50, reading: 'Revelation 18–22', questions: [
    { q: 'As Babylon falls, the great multitude in heaven cries out...', options: ['"Hallelujah!"', '"Woe, woe!"', '"Holy, holy!"'], answer: 0 },
    { q: 'The rider on the white horse is called Faithful and True, and his name is...', options: ['The Word of God', 'The Prince of Peace only', 'The Captain of Hosts'], answer: 0 },
    { q: 'Anyone whose name was not found written in the book of life was thrown into...', options: ['outer darkness', 'the lake of fire', 'the abyss forever'], answer: 1 },
    { q: 'In the new heaven and new earth, God himself will wipe away...', options: ['every tear from their eyes', 'the memory of the old world', 'the sun and moon'], answer: 0 },
    { q: 'Jesus declares, "I am the Alpha and the Omega, the beginning and the..."', options: ['end', 'firstborn', 'crown'], answer: 0 },
  ]},
];

export const PASS_FRACTION = 2 / 3; // documented judgment: >= ceil(2/3 * total)

export function questionsForDay(day) {
  const entry = QUIZ_BANK.find(d => d.day === day);
  return entry ? entry.questions : null;
}

// What the client gets — answers stripped server-side only.
export function publicQuestionsForDay(day) {
  const qs = questionsForDay(day);
  if (!qs) return null;
  return qs.map((q, i) => ({ index: i, q: q.q, options: q.options }));
}

export function requiredScore(total) { return Math.ceil(PASS_FRACTION * total); }

// Grade answers ([indexes]) for a day. Returns { score, total, passed }.
export function gradeDay(day, answers) {
  const qs = questionsForDay(day);
  if (!qs) return null;
  let score = 0;
  for (let i = 0; i < qs.length; i++) if (Number(answers?.[i]) === qs[i].answer) score++;
  const total = qs.length;
  return { score, total, passed: score >= requiredScore(total) };
}
