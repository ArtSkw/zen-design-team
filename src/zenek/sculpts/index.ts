import type { SculptSpec } from './types'
import { krystianHair } from './krystian'
import { kamilHair } from './kamil'
import { mateuszBeard, mateuszHair } from './mateusz-n'
import { arturBeard, arturMoustache } from './artur'
import { magdaHair, magdaTie } from './magda-r'
import { janekHair } from './janek'
import { lukaszForearm, lukaszHair, lukaszUpperArm } from './lukasz-p'
import { mateuszKBeard, mateuszKHair } from './mateusz-k'
import { anetaCollar, anetaHair, anetaInner, anetaShirt } from './aneta'
import { karolBeard } from './karol'
import { magdaJCurl, magdaJHair } from './magda-j'
import { mirekCollar, mirekHair, mirekJacket } from './mirek'
import { edytaHair, edytaKerchief } from './edyta'

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
  'mateusz-k-beard': mateuszKBeard,
  'aneta-hair': anetaHair,
  'aneta-shirt': anetaShirt,
  'aneta-collar': anetaCollar,
  'aneta-inner': anetaInner,
  'karol-beard': karolBeard,
  'magda-j-hair': magdaJHair,
  'magda-j-curl': magdaJCurl,
  'mirek-hair': mirekHair,
  'mirek-jacket': mirekJacket,
  'mirek-collar': mirekCollar,
  'edyta-hair': edytaHair,
  'edyta-kerchief': edytaKerchief,
}
