/** Incremental native evidence: verified old bytes + conservative AST dependency closure.
 * Never edits a native report, infers success, or accepts an unverified baseline.
 * Only JSON action discriminants/profile branches are specialized. Unknown syntax,
 * conditions and initialization effects remain part of the fingerprint.
 */
import ts from 'typescript';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const hostPath='host/cep/com.aiq.workbench/hostscript.jsx';
export const hostFeatures={
 'style-transfer':{actions:['style-transfer'],profiles:['selection']},
 'bleed-write':{actions:['set-bleed','read-bleed'],profiles:['document']},
 'direct-export':{actions:['export'],profiles:['selection']},
 glyph:{actions:['measure-layout'],profiles:['selection']},
 'artboard-selection':{actions:[],profiles:['document']},
 'artboard-regions':{actions:['artboards-update'],profiles:['document']},
 productivity:{actions:['productivity'],profiles:['selection']},
 'raster-host':{actions:['export'],profiles:['selection'],rasterEngine:'independent'},
 'layered-export':{actions:['export'],profiles:['document']},
 'export-lifecycle':{actions:['export'],profiles:['document'],rasterEngine:'independent'},
};
const unknown=Symbol('unknown'),printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
const unwrap=n=>ts.isParenthesizedExpression(n)?unwrap(n.expression):n;
function booleanContext(n){
 n=unwrap(n);if(!ts.isBinaryExpression(n))return n;
 const op=n.operatorToken.kind;if(op!==ts.SyntaxKind.AmpersandAmpersandToken&&op!==ts.SyntaxKind.BarBarToken)return n;
 const left=booleanContext(n.left),right=booleanContext(n.right);
 if(op===ts.SyntaxKind.AmpersandAmpersandToken){if(left.kind===ts.SyntaxKind.TrueKeyword)return right;if(right.kind===ts.SyntaxKind.TrueKeyword)return left;if(left.kind===ts.SyntaxKind.FalseKeyword)return left;}
 else{if(left.kind===ts.SyntaxKind.FalseKeyword)return right;if(right.kind===ts.SyntaxKind.FalseKeyword)return left;if(left.kind===ts.SyntaxKind.TrueKeyword)return left;}
 // x && false / x || true must retain evaluation of x.
 return ts.factory.updateBinaryExpression(n,left,n.operatorToken,right);
}
function parse(source){
 const sf=ts.createSourceFile('host.js',String(source),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(sf.parseDiagnostics.length)throw Error('Host dependency parser rejected invalid source.');
 if(sf.statements.length!==1||!ts.isVariableStatement(sf.statements[0])||sf.statements[0].declarationList.declarations.length!==1)throw Error('Unsupported host wrapper; explicit dependency review required.');
 const declaration=sf.statements[0].declarationList.declarations[0],call=declaration.initializer&&unwrap(declaration.initializer),iife=call&&ts.isCallExpression(call)&&unwrap(call.expression);
 if(!iife||!ts.isFunctionExpression(iife)||call.arguments.length||iife.parameters.length)throw Error('Unsupported host wrapper; explicit dependency review required.');
 return {sf,body:iife.body};
}
function literal(n){
 if(!n)return unknown;if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return ts.isNumericLiteral(n)?Number(n.text):n.text;
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;if(n.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isArrayLiteralExpression(n)&&!n.elements.length)return [];
 return unknown;
}
/** Evaluate only fixed JSON discriminants and pure derived locals. No eval or host execution. */
function evaluate(n,env){
 n=unwrap(n);const l=literal(n);if(l!==unknown)return l;
 if(ts.isIdentifier(n))return env.get(n.text)??unknown;
 if(ts.isPropertyAccessExpression(n)){
  const key=n.expression.getText()+'.'+n.name.text;if(env.has(key))return env.get(key);
  const object=evaluate(n.expression,env);if(n.name.text==='length'&&Array.isArray(object))return object.length;return unknown;
 }
 if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.ExclamationToken){const v=evaluate(n.operand,env);return v===unknown?unknown:!v;}
 if(ts.isConditionalExpression(n)){const c=evaluate(n.condition,env);return c===unknown?unknown:evaluate(c?n.whenTrue:n.whenFalse,env);}
 if(!ts.isBinaryExpression(n))return unknown;
 const left=evaluate(n.left,env),op=n.operatorToken.kind;
 if(op===ts.SyntaxKind.AmpersandAmpersandToken)return left===unknown?unknown:left?evaluate(n.right,env):left;
 if(op===ts.SyntaxKind.BarBarToken)return left===unknown?unknown:left||evaluate(n.right,env);
 const right=evaluate(n.right,env);if(left===unknown||right===unknown)return unknown;
 if(op===ts.SyntaxKind.EqualsEqualsEqualsToken||op===ts.SyntaxKind.EqualsEqualsToken)return left===right;
 if(op===ts.SyntaxKind.ExclamationEqualsEqualsToken||op===ts.SyntaxKind.ExclamationEqualsToken)return left!==right;
 if(op===ts.SyntaxKind.LessThanToken)return left<right;return unknown;
}
function pure(n){
 if(!n)return true;n=unwrap(n);if(literal(n)!==unknown||ts.isIdentifier(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n))return true;
 if(ts.isArrayLiteralExpression(n))return n.elements.every(pure);
 if(ts.isObjectLiteralExpression(n))return n.properties.every(p=>ts.isPropertyAssignment(p)&&!ts.isComputedPropertyName(p.name)&&pure(p.initializer));
 return false;
}
function specialize(node,name,scenario,sf){
 const env=new Map();
 // These suites exercise only the independent preparation entry. Authenticate
 // the exact early return and reject shadowing before omitting unreachable native
 // exporters. No helper called by preparation is removed from the closure.
 if(name==='exportDelivery'&&scenario.rasterEngine==='independent'){
  const first=node.body?.statements[0];
  if(!first||!ts.isIfStatement(first)||first.expression.getText(sf)!=="a.rasterEngine==='independent'"||!ts.isReturnStatement(first.thenStatement)||first.thenStatement.expression?.getText(sf)!=='prepareRasterDelivery(d,cache,a)')throw Error('Independent export entry changed; review dependency partition.');
  for(const statement of node.body.statements.slice(1)){
   const shadow=n=>{if((ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n))&&n.name?.getText(sf)==='prepareRasterDelivery')throw Error('Independent entry helper is shadowed.');ts.forEachChild(n,shadow);};shadow(statement);
  }
  node=ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,ts.factory.createBlock([first.thenStatement],true));
 }
 if(name==='handle')env.set('command',scenario.command);
 if(name==='editDocument'&&scenario.action)env.set('a.type',scenario.action);
 if(name==='readEditor'){env.set('profile',scenario.profile);env.set('p.profile',scenario.profile);env.set('p',true);}
 // Only these derived locals are immutable for the relevant branch decisions.
 if(name==='readEditor'&&scenario.profile==='document')env.set('items',[]);
 const result=ts.transform(node,[context=>{
  const visit=n=>{
   if(ts.isBlock(n)){const visited=ts.visitEachChild(n,visit,context);return ts.factory.updateBlock(visited,visited.statements.filter(s=>!ts.isEmptyStatement(s)));}
   if(ts.isIfStatement(n)){const v=evaluate(n.expression,env);if(v!==unknown){const branch=v?n.thenStatement:n.elseStatement;return branch?ts.visitNode(branch,visit):ts.factory.createEmptyStatement();}return ts.factory.updateIfStatement(n,booleanContext(ts.visitNode(n.expression,visit)),ts.visitNode(n.thenStatement,visit),n.elseStatement?ts.visitNode(n.elseStatement,visit):undefined);}
   if(name==='editDocument'&&ts.isVariableDeclaration(n)&&n.name.getText(sf)==='documentAction'&&n.initializer)return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,booleanContext(ts.visitNode(n.initializer,visit)));
   if(ts.isConditionalExpression(n)){const v=evaluate(n.condition,env);if(v!==unknown)return ts.visitNode(v?n.whenTrue:n.whenFalse,visit);}
   // The document profile creates items=[] above. Its loop initializer is preserved
   // because assignments to i also belong to the remaining function's semantics.
   if(name==='readEditor'&&scenario.profile==='document'&&ts.isForStatement(n)&&n.condition&&ts.isBinaryExpression(n.condition)&&n.condition.operatorToken.kind===ts.SyntaxKind.LessThanToken&&ts.isPropertyAccessExpression(n.condition.right)&&n.condition.right.expression.getText(sf)==='items'&&n.condition.right.name.text==='length'){
    if(n.initializer&&ts.isVariableDeclarationList(n.initializer))return ts.factory.createVariableStatement(undefined,n.initializer);
    return n.initializer?ts.factory.createExpressionStatement(n.initializer):ts.factory.createEmptyStatement();
   }
   // Replace only pure known predicates, retaining unknown left operands even if
   // the RHS is false (foo() && false still invokes foo()).
   if(ts.isBinaryExpression(n)||ts.isPrefixUnaryExpression(n)){const v=evaluate(n,env);if(typeof v==='boolean')return v?ts.factory.createTrue():ts.factory.createFalse();}
   return ts.visitEachChild(n,visit,context);
  };return root=>ts.visitNode(root,visit);
 }]);
 const text=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],sf);result.dispose();return text;
}
function identifiers(text){
 const sf=ts.createSourceFile('part.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),names=new Set();
 function visit(n){
  if(ts.isIdentifier(n)){const p=n.parent;
   if(!(ts.isPropertyAccessExpression(p)&&p.name===n)&&!(ts.isPropertyAssignment(p)&&p.name===n)&&!(ts.isMethodDeclaration(p)&&p.name===n))names.add(n.text);
  }ts.forEachChild(n,visit);
 }visit(sf);return names;
}
export function hostFingerprint(source,config){
 const {sf,body}=parse(source),definitions=new Map(),bootstrap=[];
 for(const statement of body.statements){
  if(ts.isFunctionDeclaration(statement)&&statement.name){definitions.set(statement.name.text,statement);continue;}
  if(ts.isVariableStatement(statement)){
   for(const d of statement.declarationList.declarations){if(!ts.isIdentifier(d.name))throw Error('Unsupported host binding.');definitions.set(d.name.text,ts.factory.createVariableStatement(undefined,ts.factory.createVariableDeclarationList([d])));if(!pure(d.initializer))bootstrap.push(statement);}
  }else bootstrap.push(statement);
 }
 if(!definitions.has('handle'))throw Error('Host handle entry point missing.');
 const scenarios=[...config.profiles.map(profile=>({command:'GET_EDITOR_STATE',profile})),...config.actions.map(action=>({command:'EDIT_DOCUMENT',action,profile:config.profiles[0]||'selection',rasterEngine:config.rasterEngine}))];
 if(!scenarios.length)throw Error('Empty host evidence feature.');
 const parts={},canonical={};
 for(const scenario of scenarios){
  const tag=[scenario.command,scenario.action||'',scenario.profile].join('/'),queue=['handle'],visited=new Set();
  const init=bootstrap.map(n=>specialize(n,'',scenario,sf)).join('\n');parts[tag+':@initialization']=sha256(init);
  for(const ref of identifiers(init))if(definitions.has(ref))queue.push(ref);
  while(queue.length){const name=queue.pop();if(visited.has(name))continue;visited.add(name);const node=definitions.get(name);if(!node)throw Error('Missing host entry point '+name);const text=specialize(node,name,scenario,sf);parts[tag+':'+name]=sha256(text);if(config.includeCanonical)canonical[tag+':'+name]=text;for(const ref of identifiers(text))if(ref!==name&&definitions.has(ref))queue.push(ref);}
 }
 const entries=Object.entries(parts).sort(([a],[b])=>a.localeCompare(b));return {hash:sha256(JSON.stringify(entries)),parts:Object.fromEntries(entries),...(config.includeCanonical?{canonical}:{})};
}
export function changedHostParts(before,after){return [...new Set([...Object.keys(before.parts),...Object.keys(after.parts)])].filter(k=>before.parts[k]!==after.parts[k]);}
export function sharedFunctionHashes(source){
 const {sf,body}=parse(source),result={};for(const statement of body.statements){
  if(ts.isFunctionDeclaration(statement)&&statement.name&&sharedCompatibilityFunctions.includes(statement.name.text))result[statement.name.text]=sha256(printer.printNode(ts.EmitHint.Unspecified,statement,sf));
  if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.name.text==='verifiedNativeCommands')result[d.name.text]=sha256(printer.printNode(ts.EmitHint.Unspecified,d,sf));
 }return result;
}
export function validateSharedChanges(before,after,audit){
 if(JSON.stringify(sharedFunctionHashes(before))!==JSON.stringify(audit.before)||JSON.stringify(sharedFunctionHashes(after))!==JSON.stringify(audit.after))throw Error('Shared compatibility change exceeds the audited function revisions.');
}
export function assertHostEvidence({host,expectedHash,baselineHost,feature,config=hostFeatures[feature],sharedProof}){
 if(sha256(host)===expectedHash)return {mode:'exact',sourceHash:expectedHash};
 if(!baselineHost||sha256(baselineHost)!==expectedHash)throw Error('Host evidence baseline missing or hash mismatch; original source required.');
 if(!config)throw Error('Unknown host evidence feature.');
 const before=hostFingerprint(baselineHost,config),after=hostFingerprint(host,config),changed=changedHostParts(before,after);
 if(!changed.length)return {mode:'module-equivalent',baselineHash:expectedHash,currentHash:sha256(host),fingerprint:after.hash};
 if(sharedProof&&sharedProofs.has(sharedProof)&&sharedProof.baselineHash===expectedHash&&sharedProof.currentHash===sha256(host)&&changed.every(k=>sharedCompatibilityFunctions.includes(k.slice(k.lastIndexOf(':')+1))))return {mode:'shared-compatibility',baselineHash:expectedHash,currentHash:sha256(host),changed,proofHash:sharedProof.reportHash};
 throw Error('Host '+(feature||'feature')+' dependencies changed; native evidence required: '+[...new Set(changed.map(k=>k.slice(k.lastIndexOf(':')+1)))].join(', '));
}
/** Fixed project archives only; exact source hash is the authority, never a version label. */
export async function findHostBaseline(root,expectedHash){
 const candidates=[path.join(root,hostPath),path.join(root,'host/cep-package/com.aiq.workbench/hostscript.jsx')];
 // Test archives remain immutable evidence only after matching the report hash.
 for(const folder of (await readdir(path.join(root,'artifacts'),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^(glyph|bleed|style|vector|v0)/.test(e.name))){
  candidates.push(path.join(root,'artifacts',folder.name,'hostscript.jsx'));
  if(folder.name==='vector-v0639')for(const run of await readdir(path.join(root,'artifacts',folder.name),{withFileTypes:true}))if(run.isDirectory())candidates.push(path.join(root,'artifacts',folder.name,run.name,'hostscript.jsx'));
 }
 try{for(const name of (await readdir(path.join(root,'releases'))).filter(n=>/^AIQ-Workbench-[\d.]+-Windows$/.test(n)).sort().reverse())candidates.push(path.join(root,'releases',name,'payload/com.aiq.workbench/hostscript.jsx'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const file of candidates){try{const data=await readFile(file);if(sha256(data)===expectedHash)return {data,file};}catch(e){if(e.code!=='ENOENT')throw e;}}
 throw Error('Verified host evidence baseline not found for '+expectedHash+'; preserve the original accepted package.');
}
export async function verifyHostEvidence(root,expectedHash,feature){
 const host=await readFile(path.join(root,hostPath));if(sha256(host)===expectedHash)return {mode:'exact',sourceHash:expectedHash};
 const baseline=await findHostBaseline(root,expectedHash);let sharedProof;try{sharedProof=await loadSharedCompatibility(root,expectedHash);}catch(e){if(e.code!=='ENOENT'&&!String(e.message).startsWith('Shared compatibility'))throw e;}
 const result=assertHostEvidence({host,baselineHost:baseline.data,expectedHash,feature,sharedProof});return {...result,baselineFile:baseline.file};
}
export async function hostEvidenceContext(root,expectedHash){
 const host=await readFile(path.join(root,hostPath));if(sha256(host)===expectedHash)return {host};
 const baseline=await findHostBaseline(root,expectedHash);let sharedProof;try{sharedProof=await loadSharedCompatibility(root,expectedHash);}catch(e){if(e.code!=='ENOENT'&&!String(e.message).startsWith('Shared compatibility'))throw e;}
 return {host,baselineHost:baseline.data,sharedProof};
}

export const sharedCompatibilityFunctions=['readEditor','editorStackOrder','setItemBounds','variableText','verifiedNativeCommands'];
export const sharedCompatibilityCases=['read-document-clean','read-selection-clean','read-properties-clean','read-document-dirty','read-selection-dirty','read-properties-dirty','read-undo-redo','bounds-path-default','bounds-group-default','bounds-clipped-default','bounds-text-default','variable-text-valid','variable-text-mixed-rejected','mask-command-create','mask-command-release'];
export const sharedCompatibilityReport='docs/review/shared-host-compatibility-v0636.json';
export const sharedCompatibilitySuite='scripts/test-shared-host-compatibility-v0636.mjs';
const sharedProofs=new WeakSet();
export function validateSharedCompatibility(report,{baselineHash,currentHash,suiteHash,nativeHash}){
 if(report.kind!=='real-illustrator-shared-compatibility'||report.passed!==true||report.baselineHash!==baselineHash||report.currentHash!==currentHash||report.suiteHash!==suiteHash||report.nativeHash!==nativeHash||!Array.isArray(report.checks)||report.checks.some(c=>c.passed!==true)||sharedCompatibilityCases.some(id=>report.checks.filter(c=>c.id===id).length!==1))throw Error('Shared compatibility evidence incomplete or stale.');
 const proof={baselineHash,currentHash,reportHash:sha256(JSON.stringify(report))};sharedProofs.add(proof);return proof;
}
export function assertSharedCompatibilityUnchanged(testedHost,currentHost){
 // Match the actual shared suite: state profiles, geometry writes, variable text
 // and native mask commands. Follow every reachable helper and initialization.
 const config={profiles:['document','selection','properties'],actions:['geometry','variable-data','native']};
 if(hostFingerprint(testedHost,config).hash!==hostFingerprint(currentHost,config).hash)throw Error('Shared compatibility dependencies changed; repeat the affected native checks.');
}
export async function loadSharedCompatibility(root,baselineHash){
 const [raw,host,suite,native]=await Promise.all([readFile(path.join(root,sharedCompatibilityReport),'utf8'),readFile(path.join(root,hostPath)),readFile(path.join(root,sharedCompatibilitySuite)),readFile(path.join(root,'artifacts/native/AIQNative.aip'))]);
 const baseline=await findHostBaseline(root,baselineHash),audit=JSON.parse(await readFile(path.join(root,'scripts/evidence-baselines/shared-host-changes-v0636.json'),'utf8'));
 validateSharedChanges(baseline.data,host,audit);
 const report=JSON.parse(raw),currentHash=sha256(host),tested=await findHostBaseline(root,report.currentHash);
 const original=validateSharedCompatibility(report,{baselineHash,currentHash:sha256(tested.data),suiteHash:sha256(suite),nativeHash:sha256(native)});
 if(original.currentHash===currentHash)return original;
 assertSharedCompatibilityUnchanged(tested.data,host);
 const proof={baselineHash,currentHash,reportHash:original.reportHash};sharedProofs.add(proof);return proof;
}
