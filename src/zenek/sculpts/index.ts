import type { SculptSpec } from './types'
import { krystianHair } from './krystian'
import { kamilHair } from './kamil'
import { mateuszBeard, mateuszHair } from './mateusz-n'
import { arturBeard, arturMoustache } from './artur'
import { magdaHair, magdaTie } from './magda-r'
import { janekHair } from './janek'
import { lukaszForearm, lukaszHair, lukaszUpperArm } from './lukasz-p'
import { mateuszKHair } from './mateusz-k'

// Every baked accessory, by name (the file is public/sculpts/<name>.bin).
export const SCULPTS: Record<string, SculptSpec> = {
  'krystian-hair': krystianHair,
  'kamil-hair': kamilHair,
  'mateusz-n-hair': mateuszHair,
  'mateusz-n-beard': mateuszBeard,
  'artur-beard': arturBeard,
  'artur-moustache': arturMoustache,
  'magda-r-hair': magdaHair,
  'magda-r-tie': magdaTie,
  'janek-hair': janekHair,
  'lukasz-p-hair': lukaszHair,
  'lukasz-p-upperarm': lukaszUpperArm,
  'lukasz-p-forearm': lukaszForearm,
  'mateusz-k-hair': mateuszKHair,
}
