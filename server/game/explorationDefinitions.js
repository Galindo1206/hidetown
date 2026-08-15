const zoneDefinitions = [
  {
    id: "church", name: "Iglesia", symbol: "✦",
    objects: [
      object("bell-rope", "Cuerda de la campana", "Una cuerda gruesa desciende junto al coro.", "physical", "La cuerda inmóvil", "El polvo acumulado sobre la cuerda no presenta marcas recientes. Nadie parece haberla utilizado para hacer sonar las campanas.", "La cuerda tiene una franja limpia, como si alguien la hubiera utilizado recientemente.", "La cuerda no solamente está cubierta de polvo; el mecanismo tampoco presenta vibraciones recientes. El sonido no fue producido normalmente."),
      object("altar", "Altar", "El altar conserva una frase oscura y restos de pigmento.", "trace", "La tinta del altar", "El mensaje del altar fue escrito con tinta mezclada con ceniza.", "El mensaje parece escrito con tinta común; la ceniza cayó encima mucho después.", "La ceniza está integrada en el trazo y comparte composición con los restos de la calle occidental."),
      object("candles", "Velas", "Varias velas consumidas rodean una hornacina de piedra.", "physical", "Tierra en la cera", "Una de las velas contiene tierra atrapada dentro de la cera.", "La tierra está solamente sobre la vela y pudo caer cuando la movieron.", "La tierra quedó encerrada mientras la cera aún estaba líquida: la vela fue encendida fuera de su lugar habitual.")
    ]
  },
  {
    id: "bell-tower", name: "Campanario", symbol: "⌂",
    objects: [
      object("stopped-clock", "Reloj detenido", "Las agujas del gran reloj permanecen inmóviles.", "object", "Las 11:47", "El reloj del campanario quedó detenido a las 11:47, aunque las campanas sonaron a medianoche.", "El reloj muestra las 11:47, pero sus engranajes pudieron seguir funcionando hasta medianoche.", "El eje se bloqueó exactamente a las 11:47 y no pudo accionar ninguna campana después de esa hora."),
      object("bell-mechanism", "Mecanismo de las campanas", "Engranajes fríos y pesados ocupan el centro de la torre.", "physical", "Mecanismo inmóvil", "El mecanismo está inmóvil y no muestra señales de haber funcionado esa noche.", "El mecanismo conserva una marca brillante compatible con un movimiento reciente.", "No hay calor, lubricante desplazado ni vibración residual: el sonido tuvo otra causa."),
      object("dusty-stairs", "Escalera cubierta de polvo", "Una escalera estrecha sube hacia las vigas.", "trace", "Escalones intactos", "El polvo de la escalera solo está alterado en los peldaños inferiores; nadie llegó hasta las campanas.", "Hay marcas leves hasta el último peldaño, como si alguien hubiera subido con cuidado.", "Las marcas superiores pertenecen a insectos y madera caída; ninguna huella humana alcanza la plataforma.")
    ]
  },
  {
    id: "square", name: "Plaza", symbol: "◇",
    objects: [
      object("mud-prints", "Huellas de barro", "Un rastro irregular cruza las piedras de la plaza.", "trace", "Huellas sin regreso", "Las huellas comienzan en la plaza y terminan frente al altar. No existen huellas que regresen.", "Las huellas se mezclan cerca de la iglesia; una segunda línea tenue parece regresar a la plaza.", "La presión y la separación pertenecen a un único recorrido de ida; el supuesto regreso es agua entre las piedras."),
      object("fountain", "Fuente", "El agua oscura de la fuente apenas refleja la luna.", "physical", "Agua con ceniza", "En el borde interior de la fuente flotan partículas de ceniza que llegaron antes de la lluvia.", "Las partículas parecen polvo corriente arrastrado por el viento después de la lluvia.", "La capa de agua cubre la ceniza: fue depositada antes de que comenzara a llover."),
      object("old-post", "Poste antiguo", "Un poste de avisos conserva papeles rasgados.", "document", "Aviso arrancado", "Bajo un anuncio arrancado aparece un horario antiguo: el campanario debía permanecer cerrado esa noche.", "El horario está incompleto y podría corresponder a otra semana.", "La tinta y el sello municipal corresponden al mismo día del incidente." )
    ]
  },
  {
    id: "caretaker-house", name: "Casa del cuidador", symbol: "▣",
    objects: [
      object("locked-chest", "Cofre", "Un pequeño cofre cerrado descansa bajo la mesa.", "object", "Cofre cerrado", "La llave del cuidador apareció dentro de un cofre cerrado.", "El cierre del cofre está gastado y pudo abrirse sin llave.", "El cierre no fue forzado y el polvo del borde está intacto: la llave quedó dentro antes de cerrarlo."),
      object("caretaker-diary", "Diario", "Un diario húmedo permanece abierto en su última página.", "document", "Advertencia del diario", "El diario contiene una advertencia: «Quien regrese no siempre será quien partió».", "La frase fue añadida con otra letra y parece una broma reciente.", "La tinta tiene la misma antigüedad que el resto de la página y la caligrafía pertenece al cuidador."),
      object("old-key", "Llave antigua", "Una llave pesada muestra barro seco en los dientes.", "object", "Barro en la llave", "La llave antigua tiene barro de la plaza, pero no encaja en la puerta de la iglesia.", "La llave encaja parcialmente en la sacristía y pudo utilizarse esa noche.", "El patrón de los dientes no corresponde a ninguna cerradura de la iglesia; el barro llegó por contacto indirecto.")
    ]
  },
  {
    id: "western-street", name: "Calle occidental", symbol: "⇠",
    objects: [
      object("western-window", "Ventana de la iglesia", "Una ventana baja comunica la calle con la nave lateral.", "physical", "Ventana occidental", "La ventana estaba abierta. En el marco se encontró barro húmedo orientado hacia el interior.", "El barro está orientado hacia fuera, como si alguien hubiera escapado por la ventana.", "Las salpicaduras y el arrastre del marco confirman un movimiento desde la calle hacia la iglesia."),
      object("mud-trail", "Rastro de barro", "Pequeñas manchas desaparecen bajo los adoquines mojados.", "trace", "Barro de la plaza", "El rastro comparte minerales con las huellas de la plaza y conduce hacia la ventana occidental.", "El barro es común en todo el pueblo y no permite relacionar ambos rastros.", "La mezcla contiene la misma mica rojiza poco común que las huellas frente al altar."),
      object("ash-remains", "Restos de ceniza", "Un brasero apagado conserva ceniza bajo la lluvia.", "trace", "Aroma de eucalipto", "La ceniza conserva un ligero olor a eucalipto quemado.", "El olor procede de árboles cercanos y no de lo que se quemó en el brasero.", "Los aceites atrapados en la ceniza confirman que se quemaron hojas de eucalipto esa misma noche.")
    ]
  }
];

function object(id, name, description, type, title, truth, distortion, analysis) {
  return Object.freeze({ id, name, description, type, title, truth, distortion, analysis });
}

export const explorationZones = Object.freeze(zoneDefinitions.map((zone) => Object.freeze({
  ...zone,
  objects: Object.freeze(zone.objects)
})));

const zonesById = new Map(explorationZones.map((zone) => [zone.id, zone]));
const objectsById = new Map(explorationZones.flatMap((zone) => zone.objects.map((item) => [item.id, { ...item, zoneId: zone.id, zoneName: zone.name }])));

// This chronology is deliberately server-only. It must never be included in a
// public map or in the private clue DTO sent to a player.
const canonicalSteps = Object.freeze({
  "mud-prints": 1,
  fountain: 1,
  candles: 2,
  "western-window": 2,
  "mud-trail": 2,
  "bell-rope": 3,
  "stopped-clock": 3,
  "bell-mechanism": 3,
  "dusty-stairs": 3,
  altar: 4,
  "old-post": 4,
  "locked-chest": 4,
  "old-key": 4,
  "ash-remains": 4,
  "caretaker-diary": 5
});

export function getExplorationZone(zoneId) {
  return zonesById.get(zoneId) || null;
}

export function getExplorationObject(objectId) {
  return objectsById.get(objectId) || null;
}

export function toPublicExplorationMap() {
  return explorationZones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    symbol: zone.symbol,
    objects: zone.objects.map(({ id, name, description }) => ({ id, name, description }))
  }));
}

export function createFoundClue(objectId, roleId) {
  const item = getExplorationObject(objectId);
  if (!item || !["inhabitant", "investigator", "creature"].includes(roleId)) throw new TypeError("Exploración inválida.");
  const distorted = roleId === "creature";
  return {
    id: `exploration:${item.id}`,
    objectId: item.id,
    objectName: item.name,
    zoneId: item.zoneId,
    zoneName: item.zoneName,
    type: item.type,
    title: item.title,
    text: distorted ? item.distortion : item.truth,
    reliability: distorted ? "Versión incierta" : "Evidencia encontrada",
    analysis: null,
    isAuthentic: !distorted,
    canonicalStep: canonicalSteps[item.id],
    suggestedStep: distorted ? ((canonicalSteps[item.id] % 5) + 1) : null
  };
}

export function getAnalysisForObject(objectId) {
  const item = getExplorationObject(objectId);
  return item?.analysis || null;
}

export function explorationInstructions(roleId) {
  if (roleId === "creature") return "Tus hallazgos pueden estar distorsionados. Escucha a los demás y decide qué versión compartir.";
  if (roleId === "investigator") return "Puedes analizar una de tus pistas una sola vez durante la exploración.";
  return "Conserva hasta dos pistas y decide cuándo compartirlas durante la conversación.";
}

export function cloneExplorationClues(assignment) {
  if (!assignment) return null;
  return {
    cards: assignment.cards.map((card) => ({
      id: card.id,
      objectId: card.objectId,
      objectName: card.objectName,
      zoneId: card.zoneId,
      zoneName: card.zoneName,
      type: card.type,
      title: card.title,
      text: card.text,
      reliability: card.reliability,
      analysis: card.analysis
    })),
    observation: null,
    instructions: assignment.instructions
  };
}
