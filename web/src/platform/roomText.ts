/** Words used in the live committee room, in the room's language (the chair picks it in Settings). */
export type Lang = 'en' | 'es' | 'fr' | 'pt' | 'ar';
export const LANGS: { key: Lang; label: string }[] = [{ key: 'en', label: 'EN' }, { key: 'es', label: 'ES' }, { key: 'fr', label: 'FR' }, { key: 'pt', label: 'PT' }, { key: 'ar', label: 'ع' }];

const EN = {
  speakers: 'Speakers', rollCall: 'Roll call', motions: 'Motions', documents: 'Documents', gsl: "General Speakers' List",
  present: 'Present', presentVoting: 'Present and voting', absent: 'Absent', twoThirds: '2/3', majority: '1/2+1', addSeat: 'Add a seat',
  findDelegation: 'Find a delegation', readyToSpeak: 'Ready to speak', speaking: 'Speaking', onList: 'On the list', start: 'Start', pause: 'Pause',
  next: 'Next', reset: 'Reset', yield: 'Yield', rtr: 'Right of reply', extend: 'Add time', addToList: 'Add to speakers list…', time: 'Time',
  emptyList: 'Add delegations below, or tap one on the left, to start the list.', askingToSpeak: 'Asking to speak', topic: 'Topic',
  raiseMotion: 'Raise a motion', proposedBy: 'Proposed by', totalTime: 'Total time', perDelegate: 'Per delegate', canSpeak: 'delegates can speak',
  vote: 'Vote', withdraw: 'Withdraw', noMotions: 'No motions on the floor.', openVote: 'Open a vote', closeVote: 'Close the vote', clearResult: 'Clear result',
  for: 'For', against: 'Against', abstain: 'Abstain', pass: 'Pass', withRights: 'with rights', passes: 'Passes', fails: 'Fails', needed: 'Needed',
  submitNew: 'Submit new', noDocs: 'Nothing submitted yet.', sponsors: 'Sponsors', signatories: 'Signatories', approve: 'Approve', reject: 'Reject',
  chat: 'Chat', everyone: 'Everyone', everyoneSub: 'Everyone in the room', theChair: 'The chair', message: 'Message…', send: 'Send', sayHello: 'Say hello to start this conversation',
  settings: 'Settings', scores: 'Scores', end: 'End', allPresent: 'All present', finishRollCall: 'Finish roll call', startRollCall: 'Start roll call',
  waiting: 'Waiting for the chair to let you in', join: 'Join as your delegation', askToSpeak: 'Ask to speak', requestSent: 'Request sent',
  noFloor: 'No one has the floor', quorum: 'quorum', noQuorum: 'no quorum', markPresent: 'Mark yourself', yieldChair: 'To the chair', yieldQuestions: 'To questions', yieldDelegate: 'To another delegation',
  inSession: 'In session', moderated: 'Moderated caucus', unmoderated: 'Unmoderated caucus', tour: 'Tour de table', consultation: 'Consultation of the whole', voting: 'Voting procedure',
  title: 'Title', link: 'Link (https://…)', text: 'Text', submit: 'Submit', cancel: 'Cancel', pending: 'Awaiting approval', open: 'Open', passed: 'Passed', failed: 'Failed', rejected: 'Rejected',
};
export type Key = keyof typeof EN;

const T: Record<Lang, Partial<Record<Key, string>>> = {
  en: EN,
  es: {
    speakers: 'Oradores', rollCall: 'Pase de lista', motions: 'Mociones', documents: 'Documentos', gsl: 'Lista general de oradores', present: 'Presente', presentVoting: 'Presente y votando', absent: 'Ausente',
    addSeat: 'Añadir escaño', findDelegation: 'Buscar delegación', readyToSpeak: 'Listo para hablar', speaking: 'Hablando', onList: 'En la lista', start: 'Iniciar', pause: 'Pausa', next: 'Siguiente', reset: 'Reiniciar',
    yield: 'Ceder', rtr: 'Derecho a réplica', extend: 'Añadir tiempo', addToList: 'Añadir a la lista…', time: 'Tiempo', emptyList: 'Añade delegaciones abajo, o toca una a la izquierda, para empezar.', askingToSpeak: 'Piden la palabra',
    topic: 'Tema', raiseMotion: 'Presentar una moción', proposedBy: 'Propuesta por', totalTime: 'Tiempo total', perDelegate: 'Por delegado', canSpeak: 'delegados pueden hablar', vote: 'Votar', withdraw: 'Retirar',
    noMotions: 'No hay mociones.', openVote: 'Abrir votación', closeVote: 'Cerrar votación', clearResult: 'Borrar resultado', for: 'A favor', against: 'En contra', abstain: 'Abstención', pass: 'Paso', withRights: 'con derechos',
    passes: 'Aprobada', fails: 'Rechazada', needed: 'Se necesita', submitNew: 'Presentar nuevo', noDocs: 'Nada presentado todavía.', sponsors: 'Patrocinadores', signatories: 'Signatarios', approve: 'Aprobar', reject: 'Rechazar',
    chat: 'Chat', everyone: 'Todos', everyoneSub: 'Toda la sala', theChair: 'La mesa', message: 'Mensaje…', send: 'Enviar', sayHello: 'Saluda para empezar la conversación', settings: 'Ajustes', scores: 'Puntos', end: 'Terminar',
    allPresent: 'Todos presentes', finishRollCall: 'Terminar pase de lista', startRollCall: 'Iniciar pase de lista', waiting: 'Esperando a que la mesa te admita', join: 'Únete como tu delegación', askToSpeak: 'Pedir la palabra',
    requestSent: 'Solicitud enviada', noFloor: 'Nadie tiene la palabra', quorum: 'quórum', noQuorum: 'sin quórum', markPresent: 'Márcate', yieldChair: 'A la mesa', yieldQuestions: 'A preguntas', yieldDelegate: 'A otra delegación',
    inSession: 'En sesión', moderated: 'Caucus moderado', unmoderated: 'Caucus no moderado', tour: 'Ronda de mesa', consultation: 'Consulta del pleno', voting: 'Procedimiento de votación',
    title: 'Título', link: 'Enlace (https://…)', text: 'Texto', submit: 'Enviar', cancel: 'Cancelar', pending: 'Pendiente de aprobación', open: 'Abierto', passed: 'Aprobado', failed: 'Rechazado', rejected: 'Rechazado',
  },
  fr: {
    speakers: 'Orateurs', rollCall: 'Appel', motions: 'Motions', documents: 'Documents', gsl: 'Liste générale des orateurs', present: 'Présent', presentVoting: 'Présent et votant', absent: 'Absent',
    addSeat: 'Ajouter un siège', findDelegation: 'Chercher une délégation', readyToSpeak: 'Prêt à parler', speaking: 'Parle', onList: 'Sur la liste', start: 'Démarrer', pause: 'Pause', next: 'Suivant', reset: 'Réinitialiser',
    yield: 'Céder', rtr: 'Droit de réponse', extend: 'Ajouter du temps', addToList: 'Ajouter à la liste…', time: 'Temps', emptyList: 'Ajoutez des délégations ci-dessous, ou touchez-en une à gauche.', askingToSpeak: 'Demandent la parole',
    topic: 'Sujet', raiseMotion: 'Proposer une motion', proposedBy: 'Proposée par', totalTime: 'Durée totale', perDelegate: 'Par délégué', canSpeak: 'délégués peuvent parler', vote: 'Voter', withdraw: 'Retirer',
    noMotions: 'Aucune motion.', openVote: 'Ouvrir un vote', closeVote: 'Clore le vote', clearResult: 'Effacer le résultat', for: 'Pour', against: 'Contre', abstain: 'Abstention', pass: 'Passe', withRights: 'avec droits',
    passes: 'Adoptée', fails: 'Rejetée', needed: 'Requis', submitNew: 'Soumettre', noDocs: 'Rien de soumis.', sponsors: 'Auteurs', signatories: 'Signataires', approve: 'Approuver', reject: 'Rejeter',
    chat: 'Messages', everyone: 'Tout le monde', everyoneSub: 'Toute la salle', theChair: 'La présidence', message: 'Message…', send: 'Envoyer', sayHello: 'Dites bonjour pour commencer', settings: 'Réglages', scores: 'Points', end: 'Terminer',
    allPresent: 'Tous présents', finishRollCall: "Terminer l'appel", startRollCall: "Lancer l'appel", waiting: 'En attente de la présidence', join: 'Rejoindre comme votre délégation', askToSpeak: 'Demander la parole',
    requestSent: 'Demande envoyée', noFloor: "Personne n'a la parole", quorum: 'quorum', noQuorum: 'pas de quorum', markPresent: 'Se déclarer', yieldChair: 'À la présidence', yieldQuestions: 'Aux questions', yieldDelegate: 'À une autre délégation',
    inSession: 'En séance', moderated: 'Caucus modéré', unmoderated: 'Caucus non modéré', tour: 'Tour de table', consultation: "Consultation de l'assemblée", voting: 'Procédure de vote',
    title: 'Titre', link: 'Lien (https://…)', text: 'Texte', submit: 'Soumettre', cancel: 'Annuler', pending: "En attente d'approbation", open: 'Ouvert', passed: 'Adopté', failed: 'Rejeté', rejected: 'Refusé',
  },
  pt: {
    speakers: 'Oradores', rollCall: 'Chamada', motions: 'Moções', documents: 'Documentos', gsl: 'Lista geral de oradores', present: 'Presente', presentVoting: 'Presente e votante', absent: 'Ausente',
    addSeat: 'Adicionar assento', findDelegation: 'Procurar delegação', readyToSpeak: 'Pronto para falar', speaking: 'Falando', onList: 'Na lista', start: 'Iniciar', pause: 'Pausar', next: 'Próximo', reset: 'Reiniciar',
    yield: 'Ceder', rtr: 'Direito de resposta', extend: 'Adicionar tempo', addToList: 'Adicionar à lista…', time: 'Tempo', emptyList: 'Adicione delegações abaixo, ou toque numa à esquerda.', askingToSpeak: 'Pedem a palavra',
    topic: 'Tema', raiseMotion: 'Propor uma moção', proposedBy: 'Proposta por', totalTime: 'Tempo total', perDelegate: 'Por delegado', canSpeak: 'delegados podem falar', vote: 'Votar', withdraw: 'Retirar',
    noMotions: 'Sem moções.', openVote: 'Abrir votação', closeVote: 'Encerrar votação', clearResult: 'Limpar resultado', for: 'A favor', against: 'Contra', abstain: 'Abstenção', pass: 'Passo', withRights: 'com direitos',
    passes: 'Aprovada', fails: 'Rejeitada', needed: 'Necessário', submitNew: 'Submeter novo', noDocs: 'Nada submetido.', sponsors: 'Patrocinadores', signatories: 'Signatários', approve: 'Aprovar', reject: 'Rejeitar',
    chat: 'Chat', everyone: 'Todos', everyoneSub: 'Toda a sala', theChair: 'A mesa', message: 'Mensagem…', send: 'Enviar', sayHello: 'Diga olá para começar', settings: 'Definições', scores: 'Pontos', end: 'Terminar',
    allPresent: 'Todos presentes', finishRollCall: 'Terminar chamada', startRollCall: 'Iniciar chamada', waiting: 'À espera que a mesa o admita', join: 'Entrar como a sua delegação', askToSpeak: 'Pedir a palavra',
    requestSent: 'Pedido enviado', noFloor: 'Ninguém tem a palavra', quorum: 'quórum', noQuorum: 'sem quórum', markPresent: 'Marque-se', yieldChair: 'À mesa', yieldQuestions: 'A perguntas', yieldDelegate: 'A outra delegação',
    inSession: 'Em sessão', moderated: 'Caucus moderado', unmoderated: 'Caucus não moderado', tour: 'Volta à mesa', consultation: 'Consulta do plenário', voting: 'Procedimento de votação',
    title: 'Título', link: 'Link (https://…)', text: 'Texto', submit: 'Submeter', cancel: 'Cancelar', pending: 'A aguardar aprovação', open: 'Aberto', passed: 'Aprovado', failed: 'Rejeitado', rejected: 'Recusado',
  },
  ar: {
    speakers: 'المتحدثون', rollCall: 'نداء الأسماء', motions: 'المقترحات', documents: 'الوثائق', gsl: 'قائمة المتحدثين العامة', present: 'حاضر', presentVoting: 'حاضر ومصوّت', absent: 'غائب',
    addSeat: 'إضافة مقعد', findDelegation: 'ابحث عن وفد', readyToSpeak: 'جاهز للكلام', speaking: 'يتحدث', onList: 'على القائمة', start: 'ابدأ', pause: 'إيقاف مؤقت', next: 'التالي', reset: 'إعادة',
    yield: 'تنازل', rtr: 'حق الرد', extend: 'إضافة وقت', addToList: 'أضف إلى قائمة المتحدثين…', time: 'الوقت', emptyList: 'أضف وفوداً أدناه أو اختر وفداً من اليسار لبدء القائمة.', askingToSpeak: 'يطلبون الكلمة',
    topic: 'الموضوع', raiseMotion: 'تقديم مقترح', proposedBy: 'مقدَّم من', totalTime: 'الوقت الكلي', perDelegate: 'لكل مندوب', canSpeak: 'مندوبين يمكنهم الكلام', vote: 'تصويت', withdraw: 'سحب',
    noMotions: 'لا توجد مقترحات.', openVote: 'فتح التصويت', closeVote: 'إغلاق التصويت', clearResult: 'مسح النتيجة', for: 'مع', against: 'ضد', abstain: 'امتناع', pass: 'تمرير', withRights: 'مع الحق',
    passes: 'اعتُمد', fails: 'رُفض', needed: 'المطلوب', submitNew: 'تقديم جديد', noDocs: 'لم يُقدَّم شيء بعد.', sponsors: 'المقدمون', signatories: 'الموقعون', approve: 'موافقة', reject: 'رفض',
    chat: 'المحادثة', everyone: 'الجميع', everyoneSub: 'كل من في القاعة', theChair: 'الرئاسة', message: 'رسالة…', send: 'إرسال', sayHello: 'ابدأ المحادثة بالتحية', settings: 'الإعدادات', scores: 'النقاط', end: 'إنهاء',
    allPresent: 'الجميع حاضر', finishRollCall: 'إنهاء النداء', startRollCall: 'بدء النداء', waiting: 'بانتظار سماح الرئاسة بالدخول', join: 'انضم كوفدك', askToSpeak: 'اطلب الكلمة',
    requestSent: 'تم إرسال الطلب', noFloor: 'لا أحد يتحدث', quorum: 'النصاب', noQuorum: 'لا نصاب', markPresent: 'سجّل حضورك', yieldChair: 'للرئاسة', yieldQuestions: 'للأسئلة', yieldDelegate: 'لوفد آخر',
    inSession: 'في الجلسة', moderated: 'نقاش منظم', unmoderated: 'نقاش حر', tour: 'جولة على الطاولة', consultation: 'تشاور عام', voting: 'إجراء التصويت',
    title: 'العنوان', link: 'رابط (https://…)', text: 'النص', submit: 'تقديم', cancel: 'إلغاء', pending: 'بانتظار الموافقة', open: 'مفتوح', passed: 'معتمد', failed: 'مرفوض', rejected: 'مرفوض',
  },
};
export const tr = (lang: string | undefined) => (k: Key) => T[(lang as Lang) in T ? (lang as Lang) : 'en'][k] ?? EN[k];
export const MODE_KEY: Record<string, Key> = { idle: 'inSession', roll_call: 'rollCall', gsl: 'gsl', moderated: 'moderated', unmoderated: 'unmoderated', tour: 'tour', consultation: 'consultation', voting: 'voting' };
