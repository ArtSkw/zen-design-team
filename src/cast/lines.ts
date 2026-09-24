// What each Zenek says, in order: every tap says the next line, and after the last one
// it starts again from the first (src/lib/talk.ts). Keyed by member id (team.ts).
export const LINES: Record<string, string[]> = {
  artur: [
    'Dziękuję Wam za wszystko!',
    'Droższy model do myślenia, tańszy do robienia...',
    'A czemu tylko w Figmie?',
    'Próbowaliście ZENimatora?',
  ],
  aneta: [
    'Ktoś chętny do Mongolii?',
    'Wiecie jak psy tropią zaginione osoby?',
    'Zostało mi jeszcze 17 tasków z BO na dziś...',
    'Chyba z konia spadłeś.',
  ],
  'magda-r': [
    'Czy wysłaliście mi widoki do recenzji?',
    'Chyba czas na kolejny plik Mobile w Figmie...',
    'Które to już spotkanie dzisiaj?',
    'Patrząc na kolejkę to podejmiemy to w grudniu.',
  ],
  'magda-j': [
    'Kto nie uzupełnił tabelki dziś?',
    'Pamiętajcie o oddechu, każdego dnia.',
    'A widzieliście te bilety do Sewilli?',
    'No kamperem, a jak inaczej?',
  ],
  'lukasz-p': [
    'Może i krypto, ale nie Zondacrypto.',
    'Widzieliście tę promkę ostatnio na Aliexpress?',
    'No, japoński ramen to to nie jest...',
    'Rowerem zawsze spoko!',
  ],
  'lukasz-d': [
    'Dziś wrócił mi temat onboardingu...',
    'Wczoraj robiłem onboarding, dziś w sumie też.',
    'Miałem odesłać, a dostałem listę zmian o 15:59...',
    'Lecę po młodego, a potem znów onboarding.',
  ],
  kamil: [
    'Widzieliście nowy update od Figmy?',
    'Znowu ktoś grzebał w komponentach w DSie...',
    'Czemu to jest zdetachowane?',
    'Ktoś z frontów pisał, że jest inaczej.',
  ],
  mirek: [
    'Wiecie, jak się składa PAXy, to można je później i tak rozłożyć.',
    'Romper z sokiem to w sumie jak wino, nie?',
    'Ja tam nie wiem, prosty chłopak jestem.',
    'No, a jeszcze przypomniała mi się jedna rzecz...',
  ],
  krystian: [
    'Warsztaty z interesariuszami zaowocowały wyjątkowym feedbackiem...',
    'Ja się już tylko śmieję.',
    'Myślę, że Mateusz może powtórzyć to samo.',
    'Wyszło mega, a i tak to pewnie ubiją.',
  ],
  janek: [
    'Testowałem ten model, tak średnio bym powiedział...',
    'Musimy mieć jakąś sprawczość, w końcu.',
    'A jechaliście z teściami 14h jednym autem?',
    'No, z tym Czyngis Chanem to tak było przecież.',
  ],
  'mateusz-k': [
    'Dokończyłem Click2Pay, ale nie wejdzie na produkcję.',
    'Podgląd można od razu w kodzie zrobić.',
    'Ktoś idzie potańczyć?',
    'Po warsztatach wyszło, że to usuwamy.',
  ],
  'mateusz-n': [
    'Dla mnie mega spoko!',
    'Ile kroków jeszcze zostało...?',
    'Machnę te widoki i lecę do młodego.',
    'No, Claude mi to lepiej zrobił.',
  ],
  edyta: [
    'Wrócił temat kart, no i jest afera...',
    'Sprawdzaliście układ Saturna w przełożeniu na biorytm?',
    'Dziś będę miała ósme warsztaty w tym temacie.',
    'W tym miesiącu to ja bym na to uważała.',
  ],
  karol: [
    'A czemu tylko piwko?',
    'Ja mogę zostać, spieszy nam się gdzieś?',
    'To jak z tą babką i kiblem na Podlasiu...',
    'Ja tam na rejwy zawsze chętny.',
  ],
}
