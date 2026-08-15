export const publicEvidence = Object.freeze({
  id: "church-interior",
  title: "El interior de la iglesia",
  text: "Las huellas avanzan desde la plaza, atraviesan la iglesia y llegan hasta el altar, pero no hay huellas de regreso. El reloj quedó detenido a las 11:47, aunque las campanas sonaron a medianoche."
});

export const trueClues = Object.freeze([
  Object.freeze({ id: "still-rope", type: "physical", title: "La cuerda inmóvil", text: "El polvo sobre la cuerda de la campana no presenta marcas recientes. Aparentemente, nadie la utilizó.", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "western-window", type: "physical", title: "La ventana occidental", text: "La ventana occidental estaba abierta y había barro húmedo en el suelo, orientado hacia el interior.", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "warning", type: "trace", title: "La advertencia", text: "La advertencia fue escrita con tinta negra mezclada con ceniza y desprende un tenue olor a eucalipto.", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "caretaker-key", type: "object", title: "La llave del cuidador", text: "La llave del antiguo cuidador apareció dentro de un cofre cerrado, sin que nadie pudiera explicar cómo llegó allí.", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "candles", type: "physical", title: "Las velas", text: "Tres velas fueron encendidas antes de medianoche. Una de ellas conserva tierra incrustada en la cera.", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "silent-square", type: "testimony", title: "La plaza silenciosa", text: "Un habitante asegura haber oí dos voces en la plaza, aunque solo distinguió una silueta.", reliability: "Testimonio", roles: ["investigator", "inhabitant"], visibility: "private" }),
  Object.freeze({ id: "parish-book", type: "document", title: "El libro parroquial", text: "En el libro parroquial aparece una frase: «Quien regrese no siempre será quien partió».", reliability: "Confiable", roles: ["investigator", "inhabitant"], visibility: "private" })
]);

export const investigatorObservation = Object.freeze({
  id: "investigator-analysis",
  type: "analysis",
  title: "Observación analítica",
  text: "Las huellas, el estado de la cuerda y la hora del reloj sugieren que el sonido de las campanas no fue producido de una forma normal. Al menos una de las declaraciones que escuches podría estar incompleta o haber sido inventada.",
  reliability: "Análisis privado"
});

export const creatureFragment = Object.freeze({
  id: "fragmented-memory",
  type: "fragment",
  title: "Recuerdo fragmentado",
  text: "Sabes que la iglesia, el barro y las campanas son elementos importantes del misterio, pero desconoces qué encontraron exactamente los habitantes. Tendrás que escuchar sus versiones y construir una explicación creíble.",
  reliability: "Información incompleta"
});
