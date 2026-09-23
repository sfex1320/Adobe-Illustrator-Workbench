/** Native evidence ignores only audited presentation changes; runtime expressions stay bound. */
import ts from 'typescript';
import {sha256} from './host-dependency-evidence.mjs';
export function productivityUiBehavior(source){
 const sf=ts.createSourceFile('ProductivityPanel.tsx',String(source),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(sf.parseDiagnostics.length)throw Error('Invalid productivity UI baseline.');
 const result=ts.transform(sf,[context=>{
  const visit=n=>{
   if(ts.isJsxAttribute(n)&&['title','help'].includes(n.name.text)){
    if(n.initializer&&ts.isStringLiteral(n.initializer))return undefined;
    if(n.name.text==='help'&&n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression?.getText(sf)==='help')return undefined;
   }
   if(ts.isJsxText(n))return undefined;
   if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(sf)==='p'&&n.openingElement.attributes.properties.every(p=>ts.isJsxAttribute(p)&&p.name.text==='className'&&p.initializer&&ts.isStringLiteral(p.initializer))&&n.children.every(c=>ts.isJsxText(c)))return undefined;
   if(ts.isArrowFunction(n)&&ts.isVariableDeclaration(n.parent)&&n.parent.name.getText(sf)==='field'){
    if(n.parameters.length===3){const p=n.parameters[2];if(p.name.getText(sf)!=='help'||!p.questionToken||p.type?.kind!==ts.SyntaxKind.StringKeyword||p.initializer)throw Error('Unaudited field helper change.');
     const body=ts.visitNode(n.body,visit);if(/\bhelp\b/.test(ts.createPrinter().printNode(ts.EmitHint.Unspecified,body,sf)))throw Error('Tooltip parameter affects runtime.');
     return context.factory.updateArrowFunction(n,n.modifiers,n.typeParameters,n.parameters.slice(0,2),n.type,n.equalsGreaterThanToken,body);
    }
   }
   if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='field'&&n.arguments.length===3&&ts.isStringLiteral(n.arguments[2]))return context.factory.updateCallExpression(n,n.expression,n.typeArguments,n.arguments.slice(0,2));
   return ts.visitEachChild(n,visit,context);
  };return root=>ts.visitNode(root,visit);
 }]);
 const normalized=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed}).printFile(result.transformed[0]);result.dispose();return sha256(normalized);
}
