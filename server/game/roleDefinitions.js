const roleDefinitions = {
  creature: Object.freeze({
    id: "creature",
    name: "Criatura",
    icon: "moon-eye",
    theme: "creature",
    description: "Te ocultas bajo una apariencia humana mientras el pueblo intenta reconocer lo que eres.",
    objective: "Permanece oculta entre los habitantes. Escucha sus sospechas y evita que descubran tu identidad."
  }),
  investigator: Object.freeze({
    id: "investigator",
    name: "Investigador",
    icon: "lantern",
    theme: "investigator",
    description: "Tu mirada entrenada puede ordenar los relatos y encontrar contradicciones entre la neblina.",
    objective: "Analiza la información del pueblo y ayuda al grupo a descubrir quién oculta su verdadera identidad."
  }),
  inhabitant: Object.freeze({
    id: "inhabitant",
    name: "Habitante",
    icon: "village",
    theme: "inhabitant",
    description: "Conoces los silencios del pueblo y deberás decidir en quién confiar cuando llegue la noche.",
    objective: "Observa, escucha y ayuda al pueblo a identificar a la criatura antes de que termine la noche."
  })
};

export function getRoleDefinition(roleId) {
  return roleDefinitions[roleId] || null;
}

export function toPrivateRole(roleId) {
  const role = getRoleDefinition(roleId);
  return role ? { ...role } : null;
}
