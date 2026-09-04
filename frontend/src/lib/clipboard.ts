/**
 * Copie un texte dans le presse-papiers, et dit si ça a marché.
 *
 * Le presse-papiers moderne exige un contexte sécurisé : sur un serveur local
 * servi en http, il n'existe tout simplement pas. La vieille méthode, elle,
 * répond encore — et un champ hors écran ne dérange personne le temps du clic.
 *
 * Dans les deux cas, le navigateur n'accepte qu'à la suite d'un geste de
 * l'utilisateur : clic, touche. Appeler ceci hors de ce sursis échoue sans
 * bruit, d'où le booléen.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return legacyCopy(text)
  }
}

function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '-100vh'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
