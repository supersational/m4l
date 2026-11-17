const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
module.exports={ROOT,source:(...parts)=>path.join(ROOT,...parts)};
