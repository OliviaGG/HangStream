// Solo requires raw Zipf >= 3.0 words; multiplayer has its own threshold.
function validateSpellingBeeSolve(bank, period, evidence, weekly) {
  const reject=()=>({ok:false,error:'Invalid or unfinished Spelling Bee solve'});
  const unavailable=()=>({ok:false,unavailable:true,error:'Canonical Spelling Bee puzzle or classification unavailable'});
  if(!evidence||!Array.isArray(evidence.foundWords)||!evidence.foundWords.length||evidence.foundWords.length>5000)return reject();
  const puzzle=weekly?bank.getWeeklyWord('spellingbee-sp',7,7):bank.getDailyWord('spellingbee-sp',7,7);
  if(!puzzle||puzzle[weekly?'weekStart':'date']!==period||typeof puzzle.word!=='string'||!/^[a-z]+$/i.test(puzzle.word))return unavailable();
  const letters=new Set(puzzle.word.toLowerCase()),center=puzzle.word[0].toLowerCase();
  if(letters.size!==7||typeof bank.getDictionary!=='function'||typeof bank.getRawFrequency!=='function'||!bank.getStats?.().frequencyLoaded)return unavailable();
  const inHive=word=>word.length>=3&&word.length<=15&&word.includes(center)&&[...word].every(letter=>letters.has(letter));
  const common=new Set();
  for(let length=4;length<=15;length++){
    const words=bank.getDictionary(length);if(!Array.isArray(words))return unavailable();
    for(const word of words)if(inHive(word)&&bank.isValidWord(word)&&Number.isFinite(bank.getRawFrequency(word))&&bank.getRawFrequency(word)>=3)common.add(word);
  }
  if(!common.size)return unavailable();
  const found=new Set();
  for(const raw of evidence.foundWords){if(typeof raw!=='string'||!/^[a-z]{3,15}$/i.test(raw))return reject();const word=raw.toLowerCase();if(found.has(word)||!inHive(word)||!bank.isValidWord(word))return reject();found.add(word);}
  if(![...common].every(word=>found.has(word)))return reject();
  return{ok:true,won:true};
}
const validateSpellingBeeWeekly=(bank,period,evidence)=>validateSpellingBeeSolve(bank,period,evidence,true);
const validateSpellingBeeDaily=(bank,period,evidence)=>({required:true,...validateSpellingBeeSolve(bank,period,evidence,false)});
module.exports={validateSpellingBeeWeekly,validateSpellingBeeDaily};
