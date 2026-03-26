/**
 * Converte nome de MAIÚSCULAS para capitalização normal
 * Ex: "LARISSA" → "Larissa", "CLAU" → "Clau", "RAI" → "Rai"
 * Ex: "THAIS GOMES" → "Thais Gomes", "LORENA MARTINS" → "Lorena Martins"
 */
export function capitalizeName(name: string): string {
  if (!name) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
