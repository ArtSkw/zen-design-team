// Crops the Palace of Culture poster out of the original video-call plate.
import sharp from 'sharp'
await sharp('public/plate/wood-room-src.jpg').extract({ left: 418, top: 202, width: 396, height: 500 }).resize(512, 648).jpeg({ quality: 88 }).toFile('public/set/poster.jpg')
console.log('wrote public/set/poster.jpg')
