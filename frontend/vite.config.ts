import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Empreinte des données du catalogue, calculée au build.
 *
 * Les fichiers de `public/data/` sont servis avec un cache long (voir
 * `netlify.toml`) : sans ça, chaque visite retéléchargerait 1,7 Mo. Mais le
 * bundle JS et ces données sont déployés ensemble et se supposent l'un
 * l'autre — un JS neuf qui lit un `meta.json` gardé en cache par le
 * navigateur plante sur la clé qu'il attend. Le front ajoute donc `?v=` à
 * chaque URL de données : une donnée modifiée change d'URL, et le cache de
 * l'ancienne ne sert plus jamais.
 */
function dataVersion(): string {
  const dir = join(__dirname, 'public', 'data')
  const hash = createHash('sha1')
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    hash.update(name).update(readFileSync(join(dir, name)))
  }
  return hash.digest('hex').slice(0, 8)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __DATA_VERSION__: JSON.stringify(dataVersion()),
  },
})
