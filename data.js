// 30-DAY – Besser sprechen in 30 Tagen. All content is copied verbatim from the training plan
// ("Besser sprechen in 30 Tagen – Training Plan", 18 Nov 2026). Shared by the app and the tests.
(function (root) {
  'use strict';

  // The six word-order types (plan: "How to build each sentence").
  const TYPES = {
    1: { name: 'Opener + verb 2nd', rule: 'Opener in position 1, conjugated verb in position 2, then the subject. Partizip or infinitive goes to the end.', ex: 'Normalerweise stehe ich um sieben Uhr auf. Letztes Mal habe ich einen Film gesehen.',
         patterns: 'Normalerweise mache ich … · Meiner Meinung nach ist … · Ehrlich gesagt finde ich … · Für mich ist … wichtig · Gerade habe ich … gemacht · Letztes Mal habe ich … · In Zukunft möchte ich … · Im Vergleich zu … ist …' },
    2: { name: 'Verb last (weil / dass)', rule: 'Comma, conjunction, subject, …, conjugated verb LAST. Perfekt: … gemacht habe. Modal: … arbeiten möchte.', ex: '…, weil ich in Deutschland arbeiten möchte. …, dass ich zu spät aufgestanden bin.',
         patterns: '…, weil … · Ich finde, dass … · Der Grund dafür ist, dass … · Das liegt daran, dass … · Das Problem ist, dass … · Manchmal passiert es, dass … · Ich habe gemerkt, dass …' },
    3: { name: 'zu + infinitive last', rule: 'Comma, no subject in the second part, "zu + infinitive" at the end. Separable verbs: zu in the middle (aufzustehen, anzurufen).', ex: 'Ich habe vor, nächstes Jahr eine Stelle zu finden. Zurzeit bin ich dabei, früher aufzustehen.',
         patterns: 'Oft / Im Moment versuche ich, … · Zurzeit bin ich dabei, … · Ich habe vor, … · Mein Plan ist, … · Ich habe Schwierigkeiten damit, … · Was mir schwerfällt, ist, …' },
    4: { name: 'Obwohl first', rule: 'The obwohl clause has its verb last; the main clause then starts with its verb: verb, comma, verb.', ex: 'Obwohl es kalt ist, habe ich den Winter gern.',
         patterns: 'Obwohl …, habe ich …' },
    5: { name: 'Two main clauses', rule: 'Each half keeps the verb in 2nd position. "aber" does not count as a position.', ex: 'Einerseits ist das Handy praktisch, andererseits lenkt es mich ab. Früher habe ich …, aber jetzt habe ich …',
         patterns: 'Einerseits …, andererseits … · Früher habe ich …, aber jetzt …' },
    6: { name: 'Indirect question', rule: 'Question word (wie, warum, was) + subject + verb LAST. No question word order.', ex: 'Können Sie mir bitte erklären, warum die Geschäfte sonntags geschlossen sind?',
         patterns: 'Ich weiß nicht genau, wie ich … erklären soll · Ich habe nicht ganz verstanden, warum … · Können Sie mir bitte erklären, … · Was ich sagen möchte, ist …' },
  };

  // Word-order type(s) of each pattern. Patterns with a weil/dass clause after a main-clause opener carry two types.
  const PATTERN_TYPES = {
    'Normalerweise mache ich …': [1],
    'Normalerweise …': [1],
    'Ich mache …, weil …': [2],
    'Ich finde, dass …': [2],
    'Für mich ist … wichtig, weil …': [1, 2],
    'Meiner Meinung nach ist …': [1],
    'Ehrlich gesagt finde ich …': [1],
    'Ich habe … gemacht, weil …': [1, 2],
    'Der Grund dafür ist, dass …': [2],
    'Letztes Mal habe ich …': [1],
    'Gerade habe ich … gemacht.': [1],
    'Oft versuche ich, … zu …': [3],
    'Das Problem ist, dass …': [2],
    'Manchmal passiert es, dass …': [2],
    'Das liegt daran, dass …': [2],
    'Im Moment versuche ich, … zu …': [3],
    'Was mir schwerfällt, ist, … zu …': [3],
    'Was mir (nicht) schwerfällt, ist, … zu …': [3],
    'Zurzeit bin ich dabei, … zu …': [3],
    'Ich habe vor, … zu …': [3],
    'Mein Plan ist, … zu …': [3],
    'Ich habe gemerkt, dass …': [2],
    'In Zukunft möchte ich …': [1],
    'Ich habe Schwierigkeiten damit, … zu …': [3],
    'Früher habe ich …, aber jetzt …': [5],
    'Im Vergleich zu … ist …': [1],
    'Einerseits …, andererseits …': [5],
    'Obwohl …, habe ich …': [4],
    'Was ich sagen möchte, ist, dass …': [6, 2],
    'Ich weiß nicht genau, wie ich … erklären soll.': [6],
    'Ich habe nicht ganz verstanden, warum …': [6],
    'Können Sie mir bitte erklären, …?': [6],
  };

  // The ten Wortverbindungen and their Dativ ending rule (plan: "Case in the word combinations").
  const WV = {
    'am frühen Morgen':     { rule: '"am" = an dem (Dativ), so the adjective takes -en.', ending: '-en' },
    'am späten Abend':      { rule: '"am" = an dem (Dativ), so the adjective takes -en.', ending: '-en' },
    'aus gutem Grund':      { rule: 'Dativ, no article: masculine noun, so the adjective carries the ending -em.', ending: '-em' },
    'von großem Interesse': { rule: 'Dativ, no article: neuter noun, so the adjective carries the ending -em.', ending: '-em' },
    'unter starkem Druck':  { rule: 'Dativ, no article: masculine noun, so the adjective carries the ending -em.', ending: '-em' },
    'mit ernster Miene':    { rule: 'Dativ, no article: feminine noun, so the adjective carries the ending -er.', ending: '-er' },
    'mit lauter Stimme':    { rule: 'Dativ, no article: feminine noun, so the adjective carries the ending -er.', ending: '-er' },
    'mit voller Absicht':   { rule: 'Dativ, no article: feminine noun, so the adjective carries the ending -er.', ending: '-er' },
    'mit letzter Kraft':    { rule: 'Dativ, no article: feminine noun, so the adjective carries the ending -er.', ending: '-er' },
    'mit leeren Händen':    { rule: 'Dativ plural, no article: the adjective takes -en and the noun -n.', ending: '-en / -n' },
  };

  // The nine interview questions, numbered in Tolomeo's order (18 Nov 2026).
  // Question 8: the plan names the topic only ("Ein wichtiger Kunde war unzufrieden"); edit `de` to his exact wording.
  const QUESTIONS = [
    { n: 1, de: 'Erzählen Sie uns bitte etwas über sich und Ihren beruflichen Werdegang.' },
    { n: 2, de: 'Wie organisieren und priorisieren Sie Ihren Arbeitstag?' },
    { n: 3, de: 'Warum bewerben Sie sich genau auf diese Position bei uns?' },
    { n: 4, de: 'Was sind Ihre drei größten fachlichen Stärken für diese Stelle?' },
    { n: 5, de: 'Was ist Ihre größte Schwäche?' },
    { n: 6, de: 'Wie sicher sind Sie sprachlich im Team und gegenüber internationalen Partnern?' },
    { n: 7, de: 'Warum sollten wir uns für Sie entscheiden?' },
    { n: 8, de: 'Ein wichtiger Kunde war unzufrieden.' },
    { n: 9, de: 'Warum haben Sie Ihren letzten Arbeitgeber verlassen?' },
  ];

  // kind: 'q' = interview question (q = its number), 'pdf' = PDF topic, 'ask' = asking back / clarifying, 'mock' = Day 30.
  // a / b: p = pattern, ex = model sentence, tag = label on the card. wv: p = phrase, ex = model sentence, n = 1st or 2nd time.
  // say: what "Read question aloud" speaks (the topic without the plan's (2nd)/(PDF) markers).
  const D = (d, kind, q, topic, say, a, b, wv) => ({ d, w: d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4, kind, q, topic, say, a, b, wv });
  const A = (p, ex) => ({ p, ex, tag: 'new' });
  const B = (p, ex, tag = 'review') => ({ p, ex, tag });
  const W = (p, ex, n = 1) => ({ p, ex, n });

  const DAYS = [
    D(1, 'q', 2, 'Wie organisieren und priorisieren Sie Ihren Arbeitstag?', 'Wie organisieren und priorisieren Sie Ihren Arbeitstag?',
      A('Normalerweise mache ich …', 'Normalerweise beginne ich den Tag mit einer kurzen Planung.'),
      B('Ich mache …, weil …', 'Ich mache jeden Morgen eine To-do-Liste, weil ich so den Überblick behalte.', 'also new'),
      W('am frühen Morgen', 'Am frühen Morgen lese ich zuerst die dringenden E-Mails.')),
    D(2, 'pdf', null, 'Ein typischer Tag in meinem letzten Beruf (PDF)', 'Ein typischer Tag in meinem letzten Beruf.',
      A('Ich finde, dass …', 'Ich finde, dass ein gut geplanter Tag weniger Stress bringt.'),
      B('Normalerweise …', 'Normalerweise habe ich Besucher empfangen und Termine koordiniert.'),
      null),
    D(3, 'q', 3, 'Warum bewerben Sie sich genau auf diese Position bei uns?', 'Warum bewerben Sie sich genau auf diese Position bei uns?',
      A('Für mich ist … wichtig, weil …', 'Für mich ist diese Position wichtig, weil ich hier meine Erfahrung in der Koordination einbringen kann.'),
      B('Ich mache …, weil …', 'Ich bewerbe mich bei Ihnen, weil Ihr Unternehmen international arbeitet.'),
      W('von großem Interesse', 'Diese Stelle ist für mich von großem Interesse.')),
    D(4, 'q', 4, 'Was sind Ihre drei größten fachlichen Stärken für diese Stelle?', 'Was sind Ihre drei größten fachlichen Stärken für diese Stelle?',
      A('Meiner Meinung nach ist …', 'Meiner Meinung nach ist meine größte Stärke die Organisation.'),
      B('Für mich ist … wichtig, weil …', 'Für mich ist Genauigkeit wichtig, weil kleine Fehler große Probleme machen können.'),
      null),
    D(5, 'q', 5, 'Was ist Ihre größte Schwäche?', 'Was ist Ihre größte Schwäche?',
      A('Ehrlich gesagt finde ich …', 'Ehrlich gesagt finde ich es schwierig, Aufgaben abzugeben.'),
      B('Ich finde, dass …', 'Ich finde, dass ich daran schon gut gearbeitet habe.'),
      null),
    D(6, 'q', 1, 'Erzählen Sie uns bitte etwas über sich und Ihren beruflichen Werdegang.', 'Erzählen Sie uns bitte etwas über sich und Ihren beruflichen Werdegang.',
      A('Ich habe … gemacht, weil …', 'Ich habe zuletzt bei FLOCERT in Bonn als Front Office & Business Support Coordinator gearbeitet, weil mir Organisation und Kundenkontakt liegen.'),
      B('Für mich ist … wichtig, weil …', 'Für mich ist internationale Arbeit wichtig, weil ich vier Sprachen spreche.'),
      null),
    D(7, 'q', 9, 'Warum haben Sie Ihren letzten Arbeitgeber verlassen?', 'Warum haben Sie Ihren letzten Arbeitgeber verlassen?',
      A('Der Grund dafür ist, dass …', 'Der Grund dafür ist, dass ich mich beruflich weiterentwickeln möchte.'),
      B('Ich habe … gemacht, weil …', 'Ich habe diese Entscheidung getroffen, weil ich eine neue Herausforderung gesucht habe.'),
      W('aus gutem Grund', 'Ich habe mich aus gutem Grund für einen Neuanfang entschieden.')),

    D(8, 'q', 8, 'Ein wichtiger Kunde war unzufrieden – Teil 1: die Situation', 'Ein wichtiger Kunde war unzufrieden. Teil 1: die Situation.',
      A('Letztes Mal habe ich …', 'Letztes Mal habe ich einen unzufriedenen Kunden sofort zurückgerufen.'),
      B('Ich habe … gemacht, weil …', 'Ich habe ihn direkt angerufen, weil er schnell eine Antwort brauchte.'),
      null),
    D(9, 'pdf', null, 'Ein Erfolg, auf den ich stolz bin (PDF)', 'Ein Erfolg, auf den ich stolz bin.',
      A('Gerade habe ich … gemacht.', 'Gerade habe ich ein schwieriges Projekt erfolgreich abgeschlossen.'),
      B('Ehrlich gesagt finde ich …', 'Ehrlich gesagt finde ich, dass sich die Arbeit gelohnt hat.'),
      null),
    D(10, 'q', 2, 'Wie organisieren und priorisieren Sie Ihren Arbeitstag? (2nd)', 'Wie organisieren und priorisieren Sie Ihren Arbeitstag?',
      A('Oft versuche ich, … zu …', 'Oft versuche ich, dringende Aufgaben zuerst zu erledigen.'),
      B('Normalerweise …', 'Normalerweise plane ich Pufferzeit für unerwartete Anfragen ein.'),
      W('am frühen Morgen', 'Am frühen Morgen erledige ich die wichtigsten Aufgaben, weil es dann ruhig ist.', 2)),
    D(11, 'q', 8, 'Ein wichtiger Kunde war unzufrieden – Teil 2: das Problem', 'Ein wichtiger Kunde war unzufrieden. Teil 2: das Problem.',
      A('Das Problem ist, dass …', 'Das Problem ist, dass die Lieferung zwei Wochen zu spät kommt und der Kunde die Ware dringend braucht.'),
      B('Meiner Meinung nach ist …', 'Meiner Meinung nach ist schnelle Kommunikation in so einem Fall das Wichtigste.'),
      W('mit lauter Stimme', 'Der Kunde hat am Telefon mit lauter Stimme reklamiert.')),
    D(12, 'pdf', null, 'Wie gehen Sie mit Stress um? (PDF)', 'Wie gehen Sie mit Stress um?',
      A('Manchmal passiert es, dass …', 'Manchmal passiert es, dass drei dringende Anfragen gleichzeitig kommen.'),
      B('Oft versuche ich, … zu …', 'Oft versuche ich, ruhig zu bleiben und eine Aufgabe nach der anderen zu erledigen.'),
      W('unter starkem Druck', 'Auch unter starkem Druck behalte ich den Überblick.')),
    D(13, 'q', 6, 'Wie sicher sind Sie sprachlich im Team und gegenüber internationalen Partnern?', 'Wie sicher sind Sie sprachlich im Team und gegenüber internationalen Partnern?',
      A('Das liegt daran, dass …', 'Im Team fühle ich mich sicher. Das liegt daran, dass ich ein C1-Zertifikat habe und jeden Tag Deutsch spreche.'),
      B('Für mich ist … wichtig, weil …', 'Für mich ist klare Kommunikation wichtig, weil es sonst Missverständnisse gibt.'),
      null),
    D(14, 'q', 3, 'Warum bewerben Sie sich genau auf diese Position bei uns? (2nd)', 'Warum bewerben Sie sich genau auf diese Position bei uns?',
      A('Im Moment versuche ich, … zu …', 'Im Moment versuche ich, eine Stelle zu finden, in der ich meine Sprachen nutzen kann.'),
      B('Der Grund dafür ist, dass …', 'Der Grund dafür ist, dass Ihr Team mit Partnern aus vielen Ländern arbeitet.'),
      W('von großem Interesse', 'Die internationale Ausrichtung Ihres Teams ist für mich von großem Interesse.', 2)),

    D(15, 'q', 5, 'Was ist Ihre größte Schwäche? (2nd)', 'Was ist Ihre größte Schwäche?',
      A('Was mir schwerfällt, ist, … zu …', 'Was mir schwerfällt, ist, Nein zu sagen.'),
      B('Ich finde, dass …', 'Ich finde, dass ich heute besser Prioritäten setze.'),
      W('am späten Abend', 'Früher habe ich oft noch am späten Abend E-Mails beantwortet.')),
    D(16, 'q', 9, '… und was haben Sie seitdem gemacht?', 'Und was haben Sie seitdem gemacht?',
      A('Zurzeit bin ich dabei, … zu …', 'Zurzeit bin ich dabei, mein Deutsch in einem Berufssprachkurs zu verbessern.'),
      B('Im Moment versuche ich, … zu …', 'Im Moment versuche ich, mich gezielt auf Stellen in Bonn und Köln zu bewerben.'),
      W('aus gutem Grund', 'Ich mache den Kurs aus gutem Grund: Ich möchte im Beruf noch sicherer sprechen.', 2)),
    D(17, 'q', 7, 'Warum sollten wir uns für Sie entscheiden?', 'Warum sollten wir uns für Sie entscheiden?',
      A('Ich habe vor, … zu …', 'Ich habe vor, mich schnell in Ihre Abläufe einzuarbeiten.'),
      B('Das liegt daran, dass …', 'Das liegt daran, dass ich schon ähnliche Aufgaben übernommen habe.'),
      W('mit leeren Händen', 'Ich komme nie mit leeren Händen in ein Meeting: Ich bin immer vorbereitet.')),
    D(18, 'pdf', null, 'Wo sehen Sie sich in fünf Jahren? (PDF: Ein Ziel, das ich erreichen möchte)', 'Wo sehen Sie sich in fünf Jahren?',
      A('Mein Plan ist, … zu …', 'Mein Plan ist, in einigen Jahren mehr Verantwortung im Team zu übernehmen.'),
      B('Ich habe vor, … zu …', 'Ich habe vor, mich in der Koordination weiterzubilden.'),
      null),
    D(19, 'q', 8, 'Ein wichtiger Kunde war unzufrieden – Teil 3: Lösung und Lerneffekt', 'Ein wichtiger Kunde war unzufrieden. Teil 3: Lösung und Lerneffekt.',
      A('Ich habe gemerkt, dass …', 'Danach habe ich gemerkt, dass schnelle Information wichtiger ist als eine perfekte Lösung.'),
      B('Ich habe … gemacht, weil …', 'Ich habe dem Kunden einen neuen Termin angeboten, weil er planen musste.'),
      W('mit lauter Stimme', 'Am Ende hat der Kunde nicht mehr mit lauter Stimme gesprochen, sondern sich bedankt.', 2)),
    D(20, 'q', 1, 'Erzählen Sie etwas über sich (2nd): Ihre Zukunft', 'Erzählen Sie etwas über sich: Ihre Zukunft.',
      A('In Zukunft möchte ich …', 'In Zukunft möchte ich meine Erfahrung in einem internationalen Team einbringen.'),
      B('Ich habe gemerkt, dass …', 'Ich habe gemerkt, dass mir koordinierende Aufgaben am meisten Freude machen.'),
      null),
    D(21, 'q', 6, 'Wie sicher sind Sie sprachlich im Team? (2nd)', 'Wie sicher sind Sie sprachlich im Team?',
      A('Ich habe Schwierigkeiten damit, … zu …', 'Manchmal habe ich noch Schwierigkeiten damit, sehr spezielle Fachbegriffe sofort zu finden.'),
      B('Das Problem ist, dass …', 'Das Problem ist nur, dass ich dann langsamer spreche. Aber ich frage nach und erkläre es anders.'),
      null),

    D(22, 'q', 1, 'Erzählen Sie etwas über sich und Ihren beruflichen Werdegang. (3rd)', 'Erzählen Sie etwas über sich und Ihren beruflichen Werdegang.',
      A('Früher habe ich …, aber jetzt …', 'Früher habe ich vor allem im Front Office gearbeitet, aber jetzt suche ich eine Stelle mit mehr Koordination.'),
      B('Ich habe gemerkt, dass …', 'Mit der Zeit habe ich gemerkt, dass ich gern Abläufe verbessere.'),
      W('mit voller Absicht', 'Ich habe mich mit voller Absicht für den Bereich Business Support entschieden.')),
    D(23, 'q', 4, 'Was sind Ihre drei größten fachlichen Stärken? (2nd)', 'Was sind Ihre drei größten fachlichen Stärken?',
      A('Im Vergleich zu … ist …', 'Im Vergleich zu vielen Bewerbern ist meine internationale Erfahrung ein klarer Vorteil.'),
      B('Was mir (nicht) schwerfällt, ist, … zu …', 'Was mir nicht schwerfällt, ist, mit Menschen aus anderen Kulturen zu arbeiten.'),
      W('am späten Abend', 'Wenn es dringend ist, bin ich auch am späten Abend erreichbar.', 2)),
    D(24, 'q', 2, 'Wie organisieren und priorisieren Sie Ihren Arbeitstag? (3rd)', 'Wie organisieren und priorisieren Sie Ihren Arbeitstag?',
      A('Einerseits …, andererseits …', 'Einerseits ist die Kundenanfrage dringend, andererseits muss ich die interne Frist einhalten.'),
      B('Ehrlich gesagt finde ich …', 'Ehrlich gesagt finde ich solche Situationen spannend.'),
      W('mit letzter Kraft', 'Einmal haben wir eine Frist nur mit letzter Kraft geschafft. Seitdem plane ich mehr Puffer ein.')),
    D(25, 'q', 8, 'Ein wichtiger Kunde war unzufrieden – Teil 4: die ganze Geschichte', 'Ein wichtiger Kunde war unzufrieden. Teil 4: die ganze Geschichte.',
      A('Obwohl …, habe ich …', 'Obwohl der Kunde sehr verärgert war, habe ich ruhig zugehört.'),
      B('Im Vergleich zu … ist …', 'Im Vergleich zum Anfang war der Kunde am Ende zufrieden.'),
      W('mit ernster Miene', 'Der Kunde hat mit ernster Miene ein Gespräch mit dem Teamleiter verlangt.')),
    D(26, 'q', 7, 'Warum sollten wir uns für Sie entscheiden? (2nd)', 'Warum sollten wir uns für Sie entscheiden?',
      A('Was ich sagen möchte, ist, dass …', 'Was ich sagen möchte, ist, dass ich sofort einsatzbereit bin.'),
      B('Für mich ist … wichtig, weil …', 'Für mich ist Zuverlässigkeit wichtig, weil sich ein Team auf mich verlassen muss.'),
      W('unter starkem Druck', 'Auch unter starkem Druck arbeite ich zuverlässig und genau.', 2)),
    D(27, 'q', 6, 'Wie sicher sind Sie sprachlich? (3rd): wenn Ihnen ein Wort fehlt', 'Wie sicher sind Sie sprachlich, wenn Ihnen ein Wort fehlt?',
      A('Ich weiß nicht genau, wie ich … erklären soll.', 'Ich weiß nicht genau, wie ich das auf Deutsch erklären soll. Ich versuche es anders.'),
      B('Früher habe ich …, aber jetzt …', 'Früher habe ich in solchen Momenten aufgehört, aber jetzt spreche ich einfach weiter.'),
      W('mit voller Absicht', 'Ich spreche mit voller Absicht etwas langsamer, damit mich alle gut verstehen.', 2)),
    D(28, 'ask', null, 'Nachfragen im Gespräch: Sie haben etwas nicht verstanden', 'Nachfragen im Gespräch: Sie haben etwas nicht verstanden.',
      A('Ich habe nicht ganz verstanden, warum …', 'Entschuldigung, ich habe nicht ganz verstanden, warum das Team neu aufgebaut wird.'),
      B('Einerseits …, andererseits …', 'Einerseits möchte ich genau antworten, andererseits möchte ich nichts falsch verstehen.'),
      W('mit ernster Miene', 'Der Interviewer hat mich mit ernster Miene angesehen, deshalb habe ich lieber nachgefragt.', 2)),
    D(29, 'ask', null, '„Haben Sie noch Fragen an uns?“', 'Haben Sie noch Fragen an uns?',
      A('Können Sie mir bitte erklären, …?', 'Können Sie mir bitte erklären, wie die Einarbeitung in den ersten Wochen aussieht?'),
      B('Obwohl …, habe ich …', 'Obwohl ich schon viel über Ihr Unternehmen gelesen habe, habe ich noch eine Frage zum Team.'),
      W('mit leeren Händen', 'Ich komme nicht mit leeren Händen ins Gespräch: Ich habe mir drei Fragen vorbereitet.', 2)),
    D(30, 'mock', null, 'Probe-Interview: alle neun Fragen', 'Probe-Interview: alle neun Fragen.',
      { p: 'Your choice', ex: 'The two patterns your diary lists most often under „Was möchte ich wiederholen?“', tag: 'your choice' },
      { p: 'Answer each question once', ex: 'Answer each question once, 2 minutes, in random order.', tag: 'instruction' },
      W('mit letzter Kraft', 'Das Interview habe ich nicht mit letzter Kraft geschafft, sondern ruhig und sicher.', 2)),
  ];

  // Time per round (plan: "Rules and time progression"). def = the timer's starting value for that week.
  const WEEKS = {
    1: { days: '1–7',   range: '60 s',      def: 60,  up: 'You speak 60 s on the day\'s topic without a pause longer than about 3 s' },
    2: { days: '8–14',  range: '60–90 s',   def: 90,  up: '60 s felt easy on most days of Week 1' },
    3: { days: '15–21', range: '2 min',     def: 120, up: '90 s felt easy on most days of Week 2' },
    4: { days: '22–30', range: '2–3 min',   def: 180, up: '2 min felt easy on most days of Week 3' },
  };
  const WEEK_INTRO = {
    1: 'A first short answer to most of your questions, with the verb in 2nd position and simple "weil" and "dass" clauses. The model sentences are starting points: replace the details with your own.',
    2: 'Perfekt for telling what happened: the customer story starts here and grows over four days (8, 11, 19, 25). The first "zu + infinitive" patterns appear.',
    3: 'Plans, what you have done since leaving, and the lesson from the customer story. Most new patterns end in "zu + infinitive" (type 3).',
    4: 'Contrasts and comparisons for stronger answers, plus the sentences that rescue you when a word is missing or you didn\'t understand the question (types 4–6).',
  };

  // The seven daily steps (plan: "How the framework works" + blueprint section 3).
  const STEPS = [
    { n: 1, key: 'warmup',  title: 'Morning warm-up',          time: '60 s · locked',   record: true,  dur: 'warmup', focus: [],
      text: 'Speak aloud in German about anything. Mistakes don\'t matter. Don\'t stop. The goal is to switch German on in your brain.' },
    { n: 2, key: 'prepare', title: 'Prepare 3 variations',     time: '2 min',           record: false, dur: 120, focus: ['a', 'var'],
      text: 'Listen to Satz A, read it aloud, then make 3 variations of your own by changing the second half.' },
    { n: 3, key: 'r1',      title: 'Round 1 · Satz A',         time: 'round time',      record: true,  dur: 'round', focus: ['a'],
      text: 'Speak about the topic using Satz A again and again, varied each time.' },
    { n: 4, key: 'r2',      title: 'Round 2 · Satz B',         time: 'round time',      record: true,  dur: 'round', focus: ['b'],
      text: 'Same topic, now with Satz B.' },
    { n: 5, key: 'r3',      title: 'Round 3 · combine',        time: 'round time',      record: true,  dur: 'round', focus: ['a', 'b', 'wv'],
      text: 'Combine both patterns in longer sentences. On word-combination days, work the Wortverbindung in too.' },
    { n: 6, key: 'retry',   title: 'Missing words + repeat',   time: '1× repeat round', record: true,  dur: 'round', focus: ['vault'],
      text: 'If a word was missing, keep talking around it. Look it up only after the round, then repeat that round once with the new word.' },
    { n: 7, key: 'diary',   title: 'Correction + diary',       time: '2 min',           record: false, dur: 120, focus: ['diary'],
      text: 'Write down 2–3 sentences you weren\'t sure about and get them corrected. Repeat the corrected versions aloud, then fill in the diary.' },
  ];

  const ROUND_LABEL = { warmup: 'Warm-up', r1: 'Round 1', r2: 'Round 2', r3: 'Round 3', retry: 'Retry', mock: 'Mock', final: 'Final check', free: 'Free take' };

  const typesOf = p => PATTERN_TYPES[p] || [];
  const qText = n => (QUESTIONS.find(x => x.n === n) || {}).de || '';
  const KIND_LABEL = { q: 'Interview question', pdf: 'PDF topic', ask: 'Asking back', mock: 'Mock interview' };

  const DATA = { TYPES, PATTERN_TYPES, WV, QUESTIONS, DAYS, WEEKS, WEEK_INTRO, STEPS, ROUND_LABEL, KIND_LABEL, typesOf, qText };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.TD = DATA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
