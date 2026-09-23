import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './host-dependency-evidence.mjs';
export function workspaceExportFingerprint(source){
 const sf=ts.createSourceFile('workspace.ts',String(source),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 if(sf.parseDiagnostics.length)throw Error('Invalid workspace evidence source.');
 const impossible=n=>ts.isBinaryExpression(n)&&(n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken?impossible(n.left):n.operatorToken.kind===ts.SyntaxKind.BarBarToken?impossible(n.left)&&impossible(n.right):n.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isPropertyAccessExpression(n.left)&&n.left.expression.getText(sf)==='action'&&n.left.name.text==='type'&&ts.isStringLiteral(n.right)&&n.right.text!=='export');
 const transformed=ts.transform(sf,[context=>{const visit=n=>ts.isIfStatement(n)&&impossible(n.expression)?(n.elseStatement?ts.visitNode(n.elseStatement,visit):undefined):ts.visitEachChild(n,visit,context);return root=>ts.visitNode(root,visit);}]);
 const result=sha256(ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed}).printFile(transformed.transformed[0]));transformed.dispose();return result;
}
export async function verifyWorkspaceExportEvidence(root,expected){
 const current=await readFile(path.join(root,'packages/core/src/workspace.ts'));if(sha256(current)===expected)return;
 const baseline=await readFile(path.join(root,'scripts/evidence-baselines/workspace-v0635.ts'));
 if(sha256(baseline)!==expected||workspaceExportFingerprint(baseline)!==workspaceExportFingerprint(current))throw Error('Export workspace dependencies changed; focused lifecycle evidence required.');
}
