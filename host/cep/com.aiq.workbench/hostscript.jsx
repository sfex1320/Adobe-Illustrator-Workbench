/* AIQ 0.2.0: ES3 read/selection + validated normal-path geometry. No global undo. */
var AIQ = (function () {
    // Enable only after the user-authorized Illustrator 30.0.0 native dialog check.
    var nativeSaveAsVerified = true; // Illustrator 30.0.0 native dialog save/cancel verified 2026-09-16.
    var groupingVerified = true; // Illustrator 30.0.0 grouping, clipping, stroke and stacking verified 2026-09-16.
    var serial = 0, sessions = [], snapshots = [], geometryUndo = null;
    function quote(s) {
        return '"' + String(s).replace(/["\\\u0000-\u001f]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); }) + '"';
    }
    function stringify(v) {
        if (v === null || v === undefined) { return 'null'; }
        if (typeof v === 'string') { return quote(v); }
        if (typeof v === 'number') { return isFinite(v) ? String(v) : 'null'; }
        if (typeof v === 'boolean') { return String(v); }
        var a = [], i;
        if (v instanceof Array) { for (i = 0; i < v.length; i++) { a.push(stringify(v[i])); } return '[' + a.join(',') + ']'; }
        for (i in v) { if (v.hasOwnProperty(i) && v[i] !== undefined) { a.push(quote(i) + ':' + stringify(v[i])); } }
        return '{' + a.join(',') + '}';
    }
    function parseJSON(s) {
        var p = 0;
        function ws() { while (p < s.length && /\s/.test(s.charAt(p))) { p++; } }
        function str() {
            var out = '', c, e, h; p++;
            while (p < s.length) {
                c = s.charAt(p++); if (c === '"') { return out; }
                if (c === '\\') {
                    e = s.charAt(p++);
                    if (e === 'u') { h = s.substr(p,4); if (!/^[0-9a-fA-F]{4}$/.test(h)) { throw Error('Invalid escape'); } out += String.fromCharCode(parseInt(h,16)); p += 4; }
                    else { var es = {'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}; if (!es.hasOwnProperty(e)) { throw Error('Invalid escape'); } out += es[e]; }
                } else { if (c.charCodeAt(0) < 32) { throw Error('Invalid string'); } out += c; }
            } throw Error('Unterminated string');
        }
        function value(depth) {
            if (depth > 40) { throw Error('Nesting limit'); } ws(); var c = s.charAt(p), v, key, n;
            if (c === '"') { return str(); }
            if (c === '{' || c === '[') {
                var object = c === '{', end = object ? '}' : ']'; v = object ? {} : []; p++; ws();
                if (s.charAt(p) === end) { p++; return v; }
                while (p < s.length) {
                    ws(); if (object) { if (s.charAt(p) !== '"') { throw Error('Invalid key'); } key = str(); ws(); if (s.charAt(p++) !== ':') { throw Error('Missing colon'); } }
                    var child = value(depth+1);
                    if (object) { if (key === '__proto__' || key === 'constructor' || key === 'prototype') { throw Error('Reserved key'); } v[key] = child; } else { v.push(child); }
                    ws(); c = s.charAt(p++); if (c === end) { return v; } if (c !== ',') { throw Error('Missing comma'); }
                } throw Error('Unterminated container');
            }
            if (s.substr(p,4) === 'true') { p+=4; return true; } if (s.substr(p,5) === 'false') { p+=5; return false; } if (s.substr(p,4) === 'null') { p+=4; return null; }
            n = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(p));
            if (!n) { throw Error('Invalid value'); } p += n[0].length; v = Number(n[0]); if (!isFinite(v)) { throw Error('Invalid number'); } return v;
        }
        var result = value(0); ws(); if (p !== s.length) { throw Error('Trailing input'); } return result;
    }
    function session(doc) {
        for (var i = sessions.length-1; i >= 0; i--) { var alive = false; try { for (var j = 0; j < app.documents.length; j++) { if (sessions[i].doc === app.documents[j]) { alive = true; break; } } } catch(closedDocument) { alive = false; } if (!alive) { sessions.splice(i,1); } }
        for (i = 0; i < sessions.length; i++) { if (sessions[i].doc === doc) { return sessions[i].id; } }
        var id = 'doc-' + (++serial); sessions.push({doc:doc,id:id}); return id;
    }
    function active() { if (!app.documents.length) { throw Error('没有打开的文档'); } return app.activeDocument; }
    function context() { var d=wakeActive(); if (!d) { return {noDocument:true}; } return {noDocument:false,sessionId:session(d),name:d.name,unsavedChanges:!d.saved,activeArtboardId:'ab-'+d.artboards.getActiveArtboardIndex()}; }
    function limits(item) {
        var hidden=false, locked=false, p=item;
        while (p && p.typename !== 'Document' && p.typename !== 'Application') { try { hidden=hidden || p.hidden === true || (p.typename === 'Layer' && p.visible === false); locked=locked || p.locked === true; } catch(e) { locked=true; } p=p.parent; }
        return {hidden:hidden,locked:locked};
    }
    function bounds(b) { return [b[0],-b[1],b[2],-b[3]]; }
    function kind(item) {
        if (item.typename === 'TextFrame') { return item.kind === TextType.AREATEXT ? 'text-area' : item.kind === TextType.PATHTEXT ? 'text-path' : 'text-point'; }
        return ({PathItem:'path',GroupItem:'group',CompoundPathItem:'compound-path',RasterItem:'image',PlacedItem:'image',SymbolItem:'symbol-instance'})[item.typename] || 'unknown';
    }
    function color(c) {
        if (!c || c.typename === 'NoColor') { return {kind:'none',colorId:'none'}; } var v,k,n;
        if (c.typename === 'RGBColor') { k='rgb';v=[c.red,c.green,c.blue]; }
        else if (c.typename === 'CMYKColor') { k='process-cmyk';v=[c.cyan,c.magenta,c.yellow,c.black]; }
        else if (c.typename === 'GrayColor') { k='gray';v=[c.gray]; }
        else if (c.typename === 'SpotColor') { n=c.spot.name;var baseColor=color(c.spot.color),rgb=previewRgb(baseColor),tint=c.tint/100;return {kind:c.tint===100?'spot':'spot-tint',colorId:'spot:'+n+':'+c.tint,name:n,values:[c.tint],previewRgb:rgb?[255-(255-rgb[0])*tint,255-(255-rgb[1])*tint,255-(255-rgb[2])*tint]:undefined}; }
        else if (c.typename === 'GradientColor') { n=c.gradient.name;return {kind:'gradient',colorId:'gradient:'+n,gradientId:'gradient:'+n,name:n}; }
        else { return {kind:'unknown',colorId:'unknown:'+c.typename,unresolvedReason:'未解析颜色类型 '+c.typename}; }
        return {kind:k,values:v,colorId:k+':'+v.join(',')};
    }
    function previewRgb(c){var v=c.values;if(c.kind==='rgb'){return v;}if(c.kind==='process-cmyk'){return [255*(1-v[0]/100)*(1-v[3]/100),255*(1-v[1]/100)*(1-v[3]/100),255*(1-v[2]/100)*(1-v[3]/100)];}if(c.kind==='gray'){return [v[0]*2.55,v[0]*2.55,v[0]*2.55];}return c.previewRgb;}
    function fingerprint(item,readOnly) { var s=[item.typename,item.name,String(item.geometricBounds),stringify(limits(item))];if(item.typename==='TextFrame'){s.push(item.contents);}if(!readOnly&&item.typename==='PathItem'){s.push(stringify(pathGeometry(item)));}return s.join('|'); }
    function collect(params) {
        var layerTotal,gradientTotal,swatchTotal,doc=wakeActive()||active(),sid=session(doc),stamp=sid+':'+(++serial),objects=[],spans=[],skipped=[],artboards=[],refs={},selection=[],stories=[],gradients=[],swatches=[],i,j;
        for(i=0;i<doc.artboards.length;i++){artboards.push({id:'ab-'+i,name:doc.artboards[i].name,bounds:bounds(doc.artboards[i].artboardRect)});}
        function visit(item,parentId,names,clipped){
            var id='item-'+(++serial),state=limits(item),b=bounds(item.geometricBounds),k=kind(item);
            var obj={docSessionId:sid,objectId:id,kind:k,name:item.name||'',hierarchicalPath:names,parentId:parentId||undefined,bounds:b,artboardIds:[],hidden:state.hidden,locked:state.locked,flags:{}};
            refs[id]={item:item,signature:fingerprint(item,params.readOnly),readOnly:!!params.readOnly,parent:item.parent};
            try{if(item.selected){selection.push(id);}}catch(selError){}
            for(var a=0;a<artboards.length;a++){var ab=artboards[a].bounds;if(b[0]<ab[2]&&b[2]>ab[0]&&b[1]<ab[3]&&b[3]>ab[1]){obj.artboardIds.push(artboards[a].id);}}
            if(clipped){obj.flags.insideClipGroup=true;}objects.push(obj);
            if(k==='group'){
                obj.flags.clipGroup=item.clipped;
                var children=item.pageItems,childCount=children.length;
                for(var g=0;g<childCount;g++){var child=children[g];if(child.parent===item){visit(child,id,names.concat([item.name||'组']),clipped||item.clipped);}}
            }else if(k==='path'){
                if(item.clipping){obj.flags.clipPathFor=parentId;}
                obj.fill={role:'fill',color:item.filled?color(item.fillColor):{kind:'none',colorId:'none'}};
                obj.stroke={role:'stroke',color:item.stroked?color(item.strokeColor):{kind:'none',colorId:'none'}};
            }else if(k.indexOf('text-')===0){
                try{
                    if(item.story.textFrames.length>1){throw Error('串接文字尚未解析，避免重复统计');}
                    var chars=item.textRange.characters,run=null,previousPaint='';obj.textPaints=[];
                    for(var c=0,charCount=chars.length;c<charCount;c++){
                        var ch=chars[c],ca=ch.characterAttributes,paintFill=color(ca.fillColor),paintStroke=color(ca.strokeColor),paintKey=paintFill.colorId+'|'+paintStroke.colorId;if(paintKey!==previousPaint){obj.textPaints.push({role:'fill',color:paintFill},{role:'stroke',color:paintStroke});previousPaint=paintKey;}var f=ca.textFont,style={fontFamily:f.family,fontStyle:f.style,fontSizePt:ca.size},signature=stringify(style);
                        if(!run||run.signature!==signature){run={docSessionId:sid,spanId:id+'#'+c,storyId:'story-'+id,containerObjectId:id,start:c,end:c,offsetUnit:'host',text:'',style:style,hostUnitLength:0,graphemeCount:0,signature:signature};spans.push(run);}
                        run.text+=ch.contents;run.end=c+1;run.hostUnitLength++;
                    }stories.push({storyId:'story-'+id,containerObjectIds:[id]});
                }catch(textError){obj.flags.unresolved=true;obj.flags.unresolvedReason=textError.message;skipped.push({objectId:id,kind:k,reason:textError.message});}
            }else{obj.flags.unresolved=true;obj.flags.unresolvedReason='此类型内部未解析';skipped.push({objectId:id,kind:k,reason:obj.flags.unresolvedReason});}
        }
        function visitLayer(layer,names){
            // Native collection length/index access is expensive on large documents.
            // This read-only traversal cannot change membership, so cache counts locally.
            var children=layer.pageItems,childCount=children.length;
            for(var p=0;p<childCount;p++){var child=children[p];if(child.parent===layer){visit(child,null,names,false);}}
            var sublayers=layer.layers;for(var l=0,layerCount=sublayers.length;l<layerCount;l++){var sub=sublayers[l];visitLayer(sub,names.concat([sub.name]));}
        }
        for(i=0,layerTotal=doc.layers.length;i<layerTotal;i++){visitLayer(doc.layers[i],[doc.layers[i].name]);}
        for(i=0,gradientTotal=doc.gradients.length;i<gradientTotal;i++){
            var gr=doc.gradients[i],stops=[];
            for(j=0;j<gr.gradientStops.length;j++){var st=gr.gradientStops[j];stops.push({offset:st.rampPoint,midpoint:st.midPoint,opacity:st.opacity,colorId:color(st.color).colorId,color:color(st.color)});}
            gradients.push({gradientId:'gradient:'+gr.name,name:gr.name,kind:gr.type===GradientType.RADIAL?'radial':gr.type===GradientType.LINEAR?'linear':'unknown',stops:stops});
        }
        var colorUsers={};for(j=0;j<objects.length;j++){var ob=objects[j],uses=[];if(ob.fill)uses.push(ob.fill.color.colorId);if(ob.stroke)uses.push(ob.stroke.color.colorId);for(var u=0;u<uses.length;u++){var key="$"+uses[u];if(!colorUsers[key])colorUsers[key]=[];if(u===0||uses[u]!==uses[0])colorUsers[key].push(ob.objectId);}}
        for(i=0,swatchTotal=doc.swatches.length;i<swatchTotal;i++){
            var sc=color(doc.swatches[i].color),used=colorUsers['$'+sc.colorId]||[];
            swatches.push({colorId:sc.colorId,kind:sc.kind,name:doc.swatches[i].name,values:sc.values,usedObjectIds:used,registeredAsSwatch:true});
        }
        snapshots.push({stamp:stamp,sid:sid,refs:refs});if(snapshots.length>8){snapshots.shift();}
        return {docSessionId:sid,docName:doc.name,collectionStamp:stamp,collectedAtIso:new Date().toString(),scope:params.scope,artboards:artboards,objects:objects,textSpans:spans,stories:stories,swatches:swatches,gradients:gradients,skipped:skipped,selectionObjectIds:selection,coverage:{supportedObjectCount:objects.length-skipped.length,skippedObjectCount:skipped.length,textContainerCount:stories.length,textSpanCount:spans.length,notes:['颜色覆盖路径填描及非串接文字连续颜色片段；多重外观、复杂容器内部尚未完整解析。']},hostLimitations:['串接文字未计入字体及颜色统计；效果颜色未统计。','对象引用只在会话快照中有效，选择前复核对象和父级。']};
    }
    function failed(code,message){return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:[],error:{code:code,message:message}};}
    function pathGeometry(item) {
        var points=[];
        var pathPoints=item.pathPoints,pointCount=pathPoints.length;
        for(var i=0;i<pointCount;i++){
            var p=pathPoints[i];
            points.push({anchor:[p.anchor[0],p.anchor[1]],left:[p.leftDirection[0],p.leftDirection[1]],right:[p.rightDirection[0],p.rightDirection[1]]});
        }
        return {closed:item.closed,points:points};
    }
    function setGeometry(item,state) {
        if(item.pathPoints.length!==state.points.length||item.closed!==state.closed){throw Error('路径结构已改变');}
        for(var i=0;i<state.points.length;i++){
            var p=item.pathPoints[i],s=state.points[i];p.anchor=s.anchor;p.leftDirection=s.left;p.rightDirection=s.right;
        }
    }
    function transformPaths(params) {
        var doc=wakeActive(),sid=session(doc),cache=null,i,j;
        if(params.docSessionId!==sid){return failed('DOC_SESSION_MISMATCH','文档已切换，请重新读取选区');}
        for(i=0;i<snapshots.length;i++){if(snapshots[i].stamp===params.expectedCollectionStamp&&snapshots[i].sid===sid){cache=snapshots[i];}}
        if(!cache){return failed('REF_STALE','选区记录已失效，请重新读取');}
        var transforms=params.transforms,planned=[],skipped=[],seen={};
        if(!(transforms instanceof Array)||!transforms.length){return failed('SELECTION_EMPTY','当前没有目标对象');}
        for(i=0;i<transforms.length;i++){
            var t=transforms[i],ref=cache.refs[t.objectId],target=t.targetBounds;
            if(seen[t.objectId]){return failed('REF_STALE','不能重复调整同一个对象');}seen[t.objectId]=true;
            try {if(!ref||ref.readOnly||ref.item.parent!==ref.parent||fingerprint(ref.item)!==ref.signature){return failed('REF_STALE','目标已改变，请重新读取选区');}}
            catch(stale){return failed('REF_STALE','目标已失效，请重新读取选区');}
            var item=ref.item,lim=limits(item);
            if(item.typename!=='PathItem'||item.clipping||lim.hidden||lim.locked){skipped.push({objectId:t.objectId,reason:'仅支持可编辑的普通路径，不处理蒙版路径、文字和复杂容器'});continue;}
            if(!(target instanceof Array)||target.length!==4){return failed('HOST_SCRIPT_ERROR','无效目标尺寸');}
            for(j=0;j<4;j++){if(typeof target[j]!=='number'||!isFinite(target[j])){return failed('HOST_SCRIPT_ERROR','尺寸必须是有限数字');}}
            var b=bounds(item.geometricBounds),w=b[2]-b[0],h=b[3]-b[1],tw=target[2]-target[0],th=target[3]-target[1];
            if(w<=0||h<=0||tw<=0||th<=0){return failed('HOST_SCRIPT_ERROR','宽高必须大于零；零宽或零高路径暂不支持');}
            var sx=tw/w,sy=th/h,tx=target[0],ty=target[1];
            if(t.keepProportions){sx=sy=Math.min(sx,sy);tx+=(tw-w*sx)/2;ty+=(th-h*sy)/2;}
            var before=pathGeometry(item),after={closed:before.closed,points:[]};
            for(j=0;j<before.points.length;j++){
                var original=before.points[j],point={};
                var names=['anchor','left','right'];
                for(var k=0;k<names.length;k++){var xy=original[names[k]];point[names[k]]=[tx+(xy[0]-b[0])*sx,-(ty+(-xy[1]-b[1])*sy)];}
                after.points.push(point);
            }
            planned.push({item:item,parent:ref.parent,id:t.objectId,before:before,after:after});
        }
        if(!planned.length){return {status:'unsupported',selectedObjectIds:[],skipped:skipped,sideEffects:[],error:{code:'CAPABILITY_UNSUPPORTED',message:'选区内没有可调整的普通路径'}};}
        var changed=[],rollbackFailed=false;
        try {
            for(i=0;i<planned.length;i++){changed.push(planned[i]);setGeometry(planned[i].item,planned[i].after);planned[i].after=pathGeometry(planned[i].item);}
        }catch(writeError){
            for(i=changed.length-1;i>=0;i--){try{setGeometry(changed[i].item,changed[i].before);}catch(rollbackError){rollbackFailed=true;}}
            geometryUndo=null;
            return {status:'failed',selectedObjectIds:[],skipped:skipped,sideEffects:rollbackFailed?['geometry-partial-write']:[],error:{code:'HOST_SCRIPT_ERROR',message:rollbackFailed?'调整失败且部分对象未恢复，请检查稿件':'调整失败，原始路径已恢复'}};
        }
        geometryUndo={sid:sid,items:planned};
        app.redraw();
        return {status:skipped.length?'partial':'completed',selectedObjectIds:[],skipped:skipped,sideEffects:['transform'],undoable:true};
    }
    function undoGeometry() {
        if(!geometryUndo){return failed('REF_STALE','没有可恢复的尺寸或对齐操作');}
        var undoDoc=wakeActive();
        if(!undoDoc||session(undoDoc)!==geometryUndo.sid){return failed('DOC_SESSION_MISMATCH','请切回执行调整的文档');}
        var batch=geometryUndo.items,i;
        for(i=0;i<batch.length;i++){
            try {if(batch[i].item.parent!==batch[i].parent||stringify(pathGeometry(batch[i].item))!==stringify(batch[i].after)||limits(batch[i].item).locked||limits(batch[i].item).hidden){return failed('REF_STALE','路径已被其他操作改变，不能覆盖恢复');}}
            catch(stale){return failed('REF_STALE','路径已失效，不能恢复');}
        }
        var changed=[];
        try{for(i=0;i<batch.length;i++){changed.push(batch[i]);setGeometry(batch[i].item,batch[i].before);}}
        catch(undoError){var failedRestore=false;for(i=changed.length-1;i>=0;i--){try{setGeometry(changed[i].item,changed[i].after);}catch(e){failedRestore=true;}}geometryUndo=null;return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:failedRestore?['geometry-partial-write']:[],error:{code:'HOST_SCRIPT_ERROR',message:failedRestore?'恢复失败，部分路径可能已改变，请检查稿件':'恢复失败，路径保持调整后状态'}};}
        geometryUndo=null;app.redraw();return {status:'completed',selectedObjectIds:[],skipped:[],sideEffects:['geometry-restore'],undoable:false};
    }
    function select(params){
        var doc=wakeActive(),cache=null,i,ids=params.objectIds;
        if(params.docSessionId!==session(doc)){return failed('DOC_SESSION_MISMATCH','文档已经切换，请重新查询');}
        if(!(ids instanceof Array)||!params.expectedCollectionStamp){return failed('REF_STALE','需要有效的查询快照');}
        for(i=0;i<snapshots.length;i++){if(snapshots[i].stamp===params.expectedCollectionStamp&&snapshots[i].sid===params.docSessionId){cache=snapshots[i];}}
        if(!cache){return failed('REF_STALE','快照已失效，请重新查询');}
        var items=[],chosen=[],skipped=[];
        for(i=0;i<ids.length;i++){
            var ref=cache.refs[ids[i]];
            try{
                if(!ref||ref.item.parent!==ref.parent||fingerprint(ref.item,ref.readOnly)!==ref.signature){return failed('REF_STALE','对象已改变，请重新查询');}
                var s=limits(ref.item);if(s.locked||s.hidden){skipped.push({objectId:ids[i],reason:'对象或父级已锁定／隐藏'});}else{items.push(ref.item);chosen.push(ids[i]);}
            }catch(e){return failed('REF_STALE','对象已删除，请重新查询');}
        }
        if(!items.length){return {status:skipped.length?'failed':'completed',selectedObjectIds:[],skipped:skipped,sideEffects:[]};}
        doc.selection=null;for(i=0;i<items.length;i++){items[i].selected=true;}
        var effects=['selection'];if(params.focus){try{var box=unionBounds(items),view=doc.activeView,vb=bounds(view.bounds),vw=(vb[2]-vb[0])*view.zoom,vh=(vb[3]-vb[1])*view.zoom;view.centerPoint=[(box[0]+box[2])/2,-(box[1]+box[3])/2];view.zoom=Math.max(.03,Math.min(16,Math.min(vw/Math.max(20,box[2]-box[0]),vh/Math.max(20,box[3]-box[1]))*.7));effects.push('view');}catch(viewError){skipped.push({objectId:'view',reason:'对象已选中，视图定位失败'});}}
        return {status:skipped.length?'partial':'completed',selectedObjectIds:chosen,skipped:skipped,sideEffects:effects};
    }
    // Editor tokens are independent of full-document query snapshots. Polling never replaces query targets.
    var performanceCounts={editorReads:0,signatureVisits:0,symmetryRebuilds:0};
    var editorTokens=[], replacement=null, replacementBySession={}, symmetrySession=null, lastEditorSelection=[], editorSelectionKey='', lastEditorRangeKey='';
    function hexColor(c){
        if(!c||c.typename==='NoColor'){return 'none';}
        if(c.typename!=='RGBColor'){return null;}
        function h(n){return ('0'+Math.round(n).toString(16)).slice(-2);}
        return '#'+h(c.red)+h(c.green)+h(c.blue);
    }
    function makeColor(s){if(s==='none'){return new NoColor();}if(!/^#[0-9a-fA-F]{6}$/.test(s)){throw Error('颜色请输入 #RRGGBB 或 none');}var c=new RGBColor();c.red=parseInt(s.substr(1,2),16);c.green=parseInt(s.substr(3,2),16);c.blue=parseInt(s.substr(5,2),16);return c;}
    function fontAttributes(item){var out=[];if(item.typename==='TextFrame'){for(var i=0;i<item.characters.length;i++){var a=item.characters[i].characterAttributes;out.push([a.textFont.name,a.size,stringify(color(a.fillColor)),stringify(color(a.strokeColor)),a.strokeWeight]);}}return out;}
    function editSignature(item){performanceCounts.signatureVisits++;var s=fingerprint(item)+'|'+stringify(fontAttributes(item));if(item.typename==='PathItem'){s+='|'+item.filled+'|'+item.stroked+'|'+item.strokeWidth+'|'+stringify(color(item.fillColor))+'|'+stringify(color(item.strokeColor));}if(item.typename==='CompoundPathItem'){for(var cp=0;cp<item.pathItems.length;cp++){s+='|'+editSignature(item.pathItems[cp]);}}if(item.typename==='GroupItem'){for(var i=0;i<item.pageItems.length;i++){if(item.pageItems[i].parent===item){s+='|'+editSignature(item.pageItems[i]);}}}return s;}
    function selectedTextRange(doc){var sel=doc.selection;if(!sel){return null;}if(sel.typename==='TextRange'){return sel;}if(sel.length===1){if(sel[0].typename==='TextRange'){return sel[0];}if(sel[0].typename==='TextFrame'){var ts=sel[0].textSelection;if(ts&&ts.length===1&&(ts[0].length<sel[0].textRange.length||ts[0].start!==sel[0].textRange.start)){return ts[0];}}}return null;}
    function selectedItems(doc){var sel=doc.selection,items=[],range=selectedTextRange(doc);if(range){var parent=range.parent;if(parent&&parent.typename==='TextFrame')return [parent];var frames=range.story.textFrames;for(var fi=0;fi<frames.length;fi++){var fr=frames[fi].textRange;if(range.start<fr.end&&range.end>fr.start)return [frames[fi]];}return items;}if(!sel){return items;}for(var i=0;i<sel.length;i++){if(sel[i].typename!=='TextRange'&&sel[i].geometricBounds){items.push(sel[i]);}}return items;}
    function unionBounds(items){if(!items.length){return null;}var b=bounds(items[0].geometricBounds);for(var i=1;i<items.length;i++){var n=bounds(items[i].geometricBounds);b=[Math.min(b[0],n[0]),Math.min(b[1],n[1]),Math.max(b[2],n[2]),Math.max(b[3],n[3])];}return b;}
    function pruneSymmetry(){if(!symmetrySession){return;}for(var s=0;s<sessions.length;s++){if(sessions[s].id===symmetrySession.sid){return;}}symmetrySession=null;}
    // Display stamps never traverse descendants, path points, or text contents.
    function editorBounds(item){if(item.typename==='GroupItem'&&item.clipped){var mask=clippingPath(item);if(mask)return bounds(mask.geometricBounds);}return bounds(item.geometricBounds);}
    function displayStamp(item){return item.typename+'|'+stringify(editorBounds(item));}
    function clearEditorTokens(){editorTokens=[];lastEditorSelection=[];editorSelectionKey='';lastEditorRangeKey='';}
    function pruneEditor(sid){
        if(editorTokens.length&&editorTokens[0].sid!==sid){clearEditorTokens();}
        for(var memoryKey in replacementBySession){var live=false;for(var mi=0;mi<sessions.length;mi++)if(sessions[mi].id===memoryKey)live=true;if(!live)delete replacementBySession[memoryKey];}replacement=replacementBySession[sid]||null;
        pruneSymmetry();
    }
    // 颜色模式等菜单命令会临时切换引擎上下文，访问 app.documents 可能抛“there is no document”。
    // 所有入口通过唤醒等待恢复；真无文档时返回 null，不把引擎切换期当作宿主故障。
    function wakeActive(){var d=null,wake=0;while(wake<12&&!d){try{if(app.documents.length){d=app.activeDocument;}}catch(engineBusy){}if(!d){$.sleep(250);wake++;}}return d;}
    function detailedEditorRevision(){
        if(!app.documents.length)return 'empty';var d=app.activeDocument,sel=d.selection||[],range=selectedTextRange(d),parts=[session(d),d.artboards.length,documentUnit(d),String(d.documentColorSpace)],n=sel.length||0;
        if(sel.typename==='TextRange'){sel=selectedItems(d);n=sel.length;}
        parts.push(n);if(range){parts.push(range.start,range.length);}
        for(var i=0;i<Math.min(n,64);i++){try{var it=sel[i];parts.push(it.uuid,it.typename,String(it.geometricBounds),it.opacity);if(it.typename==='PathItem'){parts.push(it.filled,hexColor(it.fillColor),it.stroked,hexColor(it.strokeColor),it.strokeWidth);}if(it.typename==='TextFrame'){var tr=range||it.textRange,ca=tr.characterAttributes,pa=tr.paragraphAttributes;parts.push(tr.length,ca.textFont.name,ca.size,ca.leading,ca.tracking,ca.horizontalScale,ca.verticalScale,ca.baselineShift,String(ca.baselinePosition),ca.autoLeading,hexColor(ca.fillColor),hexColor(ca.strokeColor),String(pa.justification),pa.leftIndent,pa.spaceAfter);}}catch(unreadable){parts.push('mixed');}}
        var input=parts.join('|'),hash=0;for(var j=0;j<input.length;j++){hash=((hash<<5)-hash+input.charCodeAt(j))|0;}return String(hash);
    }
    var pulseCache=null,pulseAt=0;
    function editorRevision(){
        if(!app.documents.length){pulseCache=null;return 'empty';}
        var d=app.activeDocument,sid=session(d),now=new Date().getTime(),index=d.artboards.getActiveArtboardIndex(),ab=d.artboards[index];
        var sel=d.selection||[],observed=[];if(sel.typename!=='TextRange'&&sel.length<=64){for(var pi=0;pi<sel.length;pi++)observed.push(sel[pi]);observeSelection(d,observed);}else{observedSelection=[];lastSelected=null;}
        if(!pulseCache||pulseCache.docSessionId!==sid||now-pulseAt>=500){pulseCache={docSessionId:sid,revision:detailedEditorRevision(),layers:editorLayers(d)};pulseAt=now;}
        return stringify({revision:pulseCache.revision,docSessionId:sid,activeArtboard:index,artboard:{index:index,name:String(ab.name),bounds:bounds(ab.artboardRect)},rulerUnit:documentUnit(d),layers:pulseCache.layers});
    }
    function editorStackOrder(item){
        var path=[],cursor=item,depth=0;
        try{while(cursor&&cursor.typename!=='Document'&&depth++<100){var position=Number(cursor.zOrderPosition);if(!isFinite(position))return null;path.unshift(position);cursor=cursor.parent;}if(!cursor||cursor.typename!=='Document'||!path.length)return null;return path;}catch(stackUnavailable){return null;}
    }
    function readEditor(p){
        performanceCounts.editorReads++;
        var d=wakeActive();
        if(!d){clearEditorTokens();replacement=null;replacementBySession={};symmetrySession=null;sessions=[];return null;}
        observeSelection(d,selectedItems(d));var readingRange=selectedTextRange(d);var sid=session(d),profile=p&&p.profile||'selection',items=profile==='document'?[]:selectedItems(d),refs=[],objects=[],abs=[],i,j;pruneEditor(sid);
        for(i=0;i<items.length;i++){
            var item=items[i],o={id:'s'+i,kind:kind(item),bounds:editorBounds(item),fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null};var stacking=editorStackOrder(item);if(stacking)o.stackOrder=stacking;
            refs.push({item:item,parent:item.parent,stamp:displayStamp(item)});
            if(item.typename==='PathItem'){o.fill=item.filled?hexColor(item.fillColor):'none';o.stroke=item.stroked?hexColor(item.strokeColor):'none';o.strokeWidth=item.strokeWidth;}
            if(profile==='properties'&&item.typename==='TextFrame'&&item.characters.length){
                var readingChars=readingRange?readingRange.characters:item.characters;o.character={};for(j=0;j<readingChars.length;j++){var a=readingChars[j].characterAttributes,characterValues={fontSize:a.size,leading:a.leading,tracking:a.tracking,baselineShift:a.baselineShift,horizontalScale:a.horizontalScale,verticalScale:a.verticalScale,opacity:item.opacity,autoLeading:a.autoLeading,baseline:'normal'};if(a.baselinePosition===FontBaselineOption.SUPERSCRIPT){characterValues.baseline='super';}else if(a.baselinePosition===FontBaselineOption.SUBSCRIPT){characterValues.baseline='sub';}for(var ck in characterValues){if(j===0){o.character[ck]=characterValues[ck];}else if(o.character[ck]!==characterValues[ck]){o.character[ck]=undefined;}}var values={font:a.textFont.name,fontSize:a.size,fill:hexColor(a.fillColor),stroke:hexColor(a.strokeColor),strokeWidth:a.strokeWeight};for(var key in values){if(j===0){o[key]=values[key];}else if(o[key]!==values[key]){o[key]=null;}}}
            }
            if(profile==='properties'&&item.typename==='TextFrame'){o.paragraph={};var prs=readingRange?readingRange.paragraphs:item.paragraphs;for(var pi=0;pi<prs.length;pi++){var pa=prs[pi].paragraphAttributes,pk=['leftIndent','rightIndent','firstLineIndent','spaceBefore','spaceAfter','autoLeadingAmount','hyphenation','everyLineComposer','minimumWordSpacing','desiredWordSpacing','maximumWordSpacing','minimumLetterSpacing','desiredLetterSpacing','maximumLetterSpacing','minimumGlyphScaling','desiredGlyphScaling','maximumGlyphScaling'];for(var pn=0;pn<pk.length;pn++){var pv=pa[pk[pn]];if(pi===0){o.paragraph[pk[pn]]=pv;}else if(o.paragraph[pk[pn]]!==pv){o.paragraph[pk[pn]]=undefined;}}var ju=String(pa.justification),jm={'Justification.LEFT':'left','Justification.CENTER':'center','Justification.RIGHT':'right','Justification.FULLJUSTIFYLASTLINELEFT':'full-left','Justification.FULLJUSTIFYLASTLINECENTER':'full-center','Justification.FULLJUSTIFYLASTLINERIGHT':'full-right','Justification.FULLJUSTIFY':'full'};if(pi===0){o.paragraph.justification=jm[ju];}else if(o.paragraph.justification!==jm[ju]){o.paragraph.justification=undefined;}}}objects.push(o);
        }
        for(i=0;i<d.artboards.length;i++){abs.push({index:i,name:d.artboards[i].name,bounds:bounds(d.artboards[i].artboardRect)});}
        var rangeKey=readingRange?String(readingRange.start)+':'+readingRange.length:'';var selectionChanged=lastEditorSelection.length!==items.length||lastEditorRangeKey!==rangeKey;lastEditorRangeKey=rangeKey;for(i=0;i<items.length;i++){try{if(lastEditorSelection[i]!==items[i]){selectionChanged=true;}}catch(removedSelection){selectionChanged=true;}}if(selectionChanged||editorSelectionKey.indexOf(sid+':')!==0){editorSelectionKey=sid+':selection-'+(++serial);lastEditorSelection=items;}
        var token=sid+':edit-'+(++serial),state={token:token,docSessionId:sid,docName:d.name,selectionKey:editorSelectionKey,unsaved:!d.saved,objects:objects,bounds:unionBounds(items),artboards:abs,activeArtboard:d.artboards.getActiveArtboardIndex(),symmetryPreview:!!(symmetrySession&&symmetrySession.sid===sid),capturedTargets:replacement&&replacement.sid===sid&&replacement.role!=='source'?replacement.refs.length:0,capturedSource:!!(replacement&&replacement.sid===sid&&replacement.role==='source'),textSelection:!!selectedTextRange(d)};
        try{state.selectedArtboards=nativeSelectedArtboards(d);}catch(boardSelectionError){state.artboardSelectionError=String(boardSelectionError);}
        state.hasSaveLocation=false;try{state.hasSaveLocation=!!String(d.path);if(state.hasSaveLocation)state.sourceFolder=d.fullName.parent.fsName;}catch(noSource){} state.rulerUnit=documentUnit(d);try{state.bleedOffsets=nativeDocumentBleed();}catch(bleedError){state.bleedOffsets=null;state.bleedError='出血暂不可用，请检查原生模块';}state.rasterResolution=d.rasterEffectSettings.resolution;state.colorSpace=d.documentColorSpace===DocumentColorSpace.CMYK?'cmyk':'rgb';state.nativeCommands=String(app.version)==='30.0.0'?verifiedNativeCommands.concat(groupingVerified?['smart-group','ungroup-all']:[]):[];state.nativeSaveAsSupported=nativeSaveAsVerified&&String(app.version)==='30.0.0'; if(symmetrySession&&symmetrySession.sid===sid){state.symmetry={axis:symmetrySession.axis,position:symmetrySession.position,side:symmetrySession.side};}
        state.layers=editorLayers(d);for(i=0;i<items.length;i++)if(items[i]===lastSelected)state.lastSelectedId='s'+i;
        editorTokens.push({token:token,sid:sid,refs:refs,profile:profile,unit:state.rulerUnit,textKey:textSelectionStamp(d),artboards:stringify(abs),activeArtboard:state.activeArtboard});if(editorTokens.length>2){editorTokens.shift();}return state;
    }
    function validRefs(refs){for(var i=0;i<refs.length;i++){var r=refs[i];try{if(r.item.parent!==r.parent||editSignature(r.item)!==r.signature){throw Error('changed');}var l=limits(r.item);if(l.locked||l.hidden){throw Error('locked');}}catch(e){throw Error('对象已改变、锁定或失效，请重新读取选区');}}}
    // A retained replacement source is only read/duplicated. Isolation adds a locked
    // ancestor to outside artwork; it does not change the source's own content.
    function replacementSourceSignature(item){
        var type=item.typename,s=[type,item.name,String(item.geometricBounds),item.hidden,item.locked,item.opacity,String(item.blendingMode)],children=null,i,n;
        if(type==='TextFrame'){s.push(item.contents,stringify(fontAttributes(item)));}
        if(type==='PathItem'){s.push(stringify(pathGeometry(item)),item.filled,item.stroked,item.strokeWidth,stringify(color(item.fillColor)),stringify(color(item.strokeColor)),item.clipping);}
        if(type==='GroupItem'){s.push(item.clipped);children=item.pageItems;}
        if(type==='CompoundPathItem')children=item.pathItems;
        if(children){n=children.length;for(i=0;i<n;i++)if(children[i].parent===item)s.push(replacementSourceSignature(children[i]));}
        return s.join('|');
    }
    function validReplacementSource(refs){
        for(var i=0;i<refs.length;i++){var r=refs[i];try{if(r.item.parent!==r.parent||replacementSourceSignature(r.item)!==r.sourceSignature)throw Error('changed');}catch(e){throw Error('来源 B 已改变或失效，请重新记住来源');}}
    }
    function positive(n){if(typeof n!=='number'||!isFinite(n)||n<=0||n>16348){throw Error('尺寸必须大于 0 且不超过 16348 pt');}return n;}

    function nativeGlyphBounds(d,items){
        var byId={},keys=[],found={},i,j,n,storyList=d.stories,storyCount=storyList.length;
        for(i=0;i<items.length;i++)byId[String(items[i].uuid)]=i;
        for(i=0;i<storyCount;i++){var frames=storyList[i].textFrames,frameCount=frames.length;for(j=0;j<frameCount;j++){var f=frames[j],id=String(f.uuid);if(byId[id]!==undefined){n=byId[id];keys[n]=i+','+j;found[n]=true;}}}
        for(i=0;i<items.length;i++)if(!found[i])throw Error('字形测量对象已失效，请重新选择');
        var nonce='';for(i=0;i<32;i++)nonce+=Math.floor(Math.random()*16).toString(16);
        var reply=new File(Folder.temp.fsName+'/AIQNative-'+nonce+'.json'),originalBounds=[];
        for(i=0;i<items.length;i++)originalBounds.push(items[i].visibleBounds);
        if(reply.exists)throw Error('字形测量请求冲突，请重试');
        try{
            app.sendScriptMessage('AIQNative','glyph-file:'+nonce+':'+keys.join(';'),'');
            if(!reply.exists||reply.length>65536||!reply.open('r'))throw Error('原生字形模块不可用，请完整安装新版并重启 Illustrator');
            var raw=reply.read();reply.close();var data=parseJSON(raw);
            if(!data||data.ok!==true||data.protocol!==1||data.unit!=='pt'||data.method!=='dictionary-outline'||!(data.items instanceof Array)||data.items.length!==items.length)throw Error('原生字形测量失败'+(data&&data.error?'：'+data.error:''));
            var result={};
            for(i=0;i<items.length;i++){var r=data.items[i];if(!r||r.story+','+r.frame!==keys[i]||!(r.bounds instanceof Array)||r.bounds.length!==4||!(r.sourceBounds instanceof Array)||r.sourceBounds.length!==4)throw Error('原生字形对象对应关系无效');
                for(j=0;j<4;j++)if(typeof r.bounds[j]!=='number'||!isFinite(r.bounds[j])||typeof r.sourceBounds[j]!=='number'||!isFinite(r.sourceBounds[j])||Math.abs(r.sourceBounds[j]-originalBounds[i][j])>.02)throw Error('测量对象边界已变化，请重新选择');
                if(r.bounds[2]<r.bounds[0]||r.bounds[1]<r.bounds[3])throw Error('原生字形边界无效');result[String(items[i].uuid)]=bounds(r.bounds);
            }
            return result;
        }finally{try{reply.close();}catch(closeGlyphReply){}if(reply.exists)reply.remove();}
    }

    function measureLayout(d,refs,a){
        if(!refs.length||refs.length>300)throw Error('请选择 1–300 个对象');
        var count=0,glyphCount=0,gather=false,glyphItems=[],glyphMap={};
        function union(x,y){if(!x)return y;if(!y)return x;return [Math.min(x[0],y[0]),Math.min(x[1],y[1]),Math.max(x[2],y[2]),Math.max(x[3],y[3])];}
        function rectangle(mask){if(mask.typename!=='PathItem'||!mask.closed||mask.pathPoints.length!==4)return false;var b=mask.geometricBounds;for(var n=0;n<4;n++){var p=mask.pathPoints[n],v=p.anchor;if(Math.abs(v[0]-b[0])>.01&&Math.abs(v[0]-b[2])>.01||Math.abs(v[1]-b[1])>.01&&Math.abs(v[1]-b[3])>.01)return false;if(String(p.leftDirection)!==String(v)||String(p.rightDirection)!==String(v))return false;}return true;}
        function measure(item,clip){
            function clipped(b){if(!b||!clip)return b;var out=[Math.max(b[0],clip[0]),Math.max(b[1],clip[1]),Math.min(b[2],clip[2]),Math.min(b[3],clip[3])];return out[2]>out[0]&&out[3]>out[1]?out:null;}
            if(++count>5000)throw Error('可见边界测量超过 5000 个节点，请缩小选区');
            if(item.hidden)return null;
            if(item.typename==='GroupItem'){
                var mask=item.clipped?clippingPath(item):null,content=null;
                if(mask&&a.clip==='frame')return clipped(bounds(mask.geometricBounds));
                if(mask&&!rectangle(mask))throw Error('可见内容目前支持矩形剪贴蒙版；曲线或复合蒙版请使用蒙版外框');
                var childClip=clip;if(mask){childClip=clipped(bounds(mask.geometricBounds));if(!childClip)return null;}
                for(var j=0;j<item.pageItems.length;j++){var child=item.pageItems[j];if(child.parent===item&&child!==mask)content=union(content,measure(child,childClip));}
                if(mask&&content){var m=bounds(mask.geometricBounds);content=[Math.max(m[0],content[0]),Math.max(m[1],content[1]),Math.min(m[2],content[2]),Math.min(m[3],content[3])];if(content[2]<=content[0]||content[3]<=content[1])return null;}return content;
            }
            if(item.typename==='TextFrame'&&a.text==='glyph'){
                if(++glyphCount>100)throw Error('字形测量一次最多 100 个文本框，请缩小选区');
                if(!item.contents.length)return null;
                if(gather){var seen=false;for(var gi=0;gi<glyphItems.length;gi++)if(glyphItems[gi]===item)seen=true;if(!seen)glyphItems.push(item);return null;}
                var gb=glyphMap[String(item.uuid)];if(!gb)throw Error('字形测量对象已失效');return clipped(gb);
            }
            // The mask toggle must not silently change frame text into visible text
            // bounds. Text's own toggle determines frame versus measured glyphs.
            return clipped(bounds(item.typename==='TextFrame'?item.geometricBounds:a.clip==='visible'?item.visibleBounds:item.geometricBounds));
        }
        var i;if(a.text==='glyph'){gather=true;for(i=0;i<refs.length;i++)measure(refs[i].item);gather=false;count=0;glyphCount=0;if(glyphItems.length)glyphMap=nativeGlyphBounds(d,glyphItems);}
        var objects=[];for(i=0;i<refs.length;i++){var b=measure(refs[i].item);if(!b)throw Error('所选对象没有可测量的可见内容');objects.push({id:'s'+i,kind:kind(refs[i].item),bounds:b,fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null});}var r=resultEdit('已测量 '+objects.length+' 个对象的边界');r.measuredObjects=objects;return r;
    }
    // Stable references are scoped to an open document session, never names or array positions.
    var layerRefs=[],layerSession='',observedSelection=[],observedSession='',lastSelected=null;
    function observeSelection(d,items){
        var sid=session(d);if(observedSession!==sid){observedSession=sid;observedSelection=[];lastSelected=null;}
        var added=[],i,j;for(i=0;i<items.length;i++){var exists=false;for(j=0;j<observedSelection.length;j++)try{if(items[i]===observedSelection[j])exists=true;}catch(removedObserved){}if(!exists)added.push(items[i]);}
        if(added.length===1)lastSelected=added[0];else if(added.length>1)lastSelected=null;
        var retained=false;for(i=0;i<items.length;i++)try{if(items[i]===lastSelected)retained=true;}catch(removedLast){lastSelected=null;}if(!retained)lastSelected=null;
        observedSelection=items.slice(0);
    }
    function editorLayers(d){
        var sid=session(d);if(layerSession!==sid){layerSession=sid;layerRefs=[];}var out=[],live=[];
        function walk(collection,depth){for(var i=0;i<collection.length;i++){if(out.length>=300)return;var l=collection[i],id=null;for(var j=0;j<layerRefs.length;j++)try{if(layerRefs[j].item===l){id=layerRefs[j].id;break;}}catch(stale){}if(!id)id=sid+':layer-'+(++serial);live.push({id:id,item:l});out.push({id:id,name:String(l.name),color:hexColor(l.color)||'#4f8cff',visible:l.visible,locked:l.locked,depth:depth});walk(l.layers,depth+1);}}
        walk(d.layers,0);layerRefs=live;return out;
    }
    function checkedBoardIndexes(d,cache,indexes){
        if(boardStamp(d)!==cache.artboards)throw Error('画板已改变，请刷新后重试');
        if(!(indexes instanceof Array)||!indexes.length)throw Error('请选择画板');var seen={};
        for(var i=0;i<indexes.length;i++){var n=indexes[i];if(typeof n!=='number'||n%1||n<0||n>=d.artboards.length||seen[n])throw Error('画板索引无效或重复：'+n+'（共 '+d.artboards.length+' 块）');seen[n]=true;}
        return seen;
    }
    function boardArtwork(d,indexes){
        var count=d.pageItems.length;if(count>50000)throw Error('画板联动一次支持最多 50000 个对象');
        var out=[],i,j,chosen={},rects=[],visits=0;for(i=0;i<indexes.length;i++)chosen[indexes[i]]=true;
        for(i=0;i<d.artboards.length;i++)rects.push(bounds(d.artboards[i].artboardRect));
        function clipBox(b,c){if(!c)return b;var r=[Math.max(b[0],c[0]),Math.max(b[1],c[1]),Math.min(b[2],c[2]),Math.min(b[3],c[3])];return r[2]>r[0]&&r[3]>r[1]?r:null;}
        function pieces(item,clip,result){
            if(++visits>100000)throw Error('画板联动可见范围遍历超过上限');if(item.hidden)return;
            if(item.typename==='GroupItem'){var mask=item.clipped?clippingPath(item):null,inside=mask?clipBox(bounds(mask.geometricBounds),clip):clip;if(mask&&!inside)return;
                var children=item.pageItems,n=children.length;for(var k=0;k<n;k++){var child=children[k];if(child.parent===item&&child!==mask)pieces(child,inside,result);}return;}
            var b=clipBox(bounds(item.visibleBounds),clip);if(b)result.push(b);
        }
        for(i=0;i<count;i++){var item=d.pageItems[i];if(item.parent.typename!=='Layer')continue;var lim=limits(item);if(lim.hidden)continue;
            var regions=[];pieces(item,null,regions);var best=-1,score=0;
            for(j=0;j<rects.length;j++){var area=0;for(var k=0;k<regions.length;k++){var hit=clipBox(regions[k],rects[j]);if(hit)area+=(hit[2]-hit[0])*(hit[3]-hit[1]);}if(area>score){score=area;best=j;}}
            if(best<0||!chosen[best])continue;
            if(lim.locked)throw Error('目标画板有锁定设计，请先解锁后再联动');
            out.push({item:item,index:best});
        }return out;
    }
    // A conservative box is sufficient only after proving a painted witness in
    // a board, larger than every other board's maximum possible overlap.
    // Ambiguous roots/curved clips still use polygons.
    function quickBoardRegion(item,boards){
        function intersect(a,b){var r=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];return r[2]>r[0]&&r[3]>r[1]?r:null;}
        function rectangular(p){if(p.typename==='CompoundPathItem'&&p.pathItems.length===1)p=p.pathItems[0];if(p.typename!=='PathItem'||!p.closed||p.pathPoints.length!==4)return false;var b=p.geometricBounds,seen={},previous=p.pathPoints[3].anchor;for(var i=0;i<4;i++){var q=p.pathPoints[i],a=q.anchor,key=String(a);if(seen[key]||(Math.abs(a[0]-previous[0])>.001&&Math.abs(a[1]-previous[1])>.001))return false;seen[key]=true;previous=a;if((Math.abs(a[0]-b[0])>.001&&Math.abs(a[0]-b[2])>.001)||(Math.abs(a[1]-b[1])>.001&&Math.abs(a[1]-b[3])>.001)||String(q.leftDirection)!==String(a)||String(q.rightDirection)!==String(a))return false;}return true;}
        function conservative(it){
            if(it.hidden||it.opacity===0)return null;
            if(it.typename!=='GroupItem')return bounds(it.typename==='PathItem'&&it.stroked?it.visibleBounds:it.geometricBounds);
            if(it.clipped){var m=clippingPath(it);return m?bounds(m.geometricBounds):bounds(it.visibleBounds);}
            var out=null;for(var j=0,n=it.pageItems.length;j<n;j++){var child=it.pageItems[j];if(child.parent!==it)continue;var b=conservative(child);if(b)out=out?[Math.min(out[0],b[0]),Math.min(out[1],b[1]),Math.max(out[2],b[2]),Math.max(out[3],b[3])]:b;}return out;
        }
        var box=conservative(item);if(!box)return {rings:[]};
        function area(b){return b?(b[2]-b[0])*(b[3]-b[1]):0;}
        var only=null,maximum=0,otherMaximum=0;for(var i=0;i<boards.length;i++){var possible=area(intersect(box,boards[i].bounds));if(possible>maximum){otherMaximum=maximum;maximum=possible;only=boards[i].bounds;}else otherMaximum=Math.max(otherMaximum,possible);}
        if(!only)return {rings:[]};var visits=0;
        function witness(it,clip){
            if(++visits>200||it.hidden||it.opacity===0)return false;
            var b;
            if(it.typename==='GroupItem'){
                var m=it.clipped?clippingPath(it):null;if(m){if(!rectangular(m))return false;clip=intersect(clip,bounds(m.geometricBounds));if(!clip)return false;}
                for(var j=0,n=it.pageItems.length;j<n;j++){var child=it.pageItems[j];if(child.parent===it&&child!==m){var found=witness(child,clip);if(found)return found;}}return false;
            }
            b=bounds(it.geometricBounds);var proof=intersect(b,clip);if(area(proof)<=otherMaximum+1e-6)return false;
            if(otherMaximum===0&&b[0]>=clip[0]&&b[1]>=clip[1]&&b[2]<=clip[2]&&b[3]<=clip[3]){
                // Nonzero signed area proves paint exists for nonzero winding.
                // Used only when the entire root can overlap this board alone.
                try{if(it.typename==='PathItem'&&!it.guides&&it.filled&&it.closed&&!it.evenodd&&Math.abs(it.area)>1e-6)return proof;
                    if(it.typename==='CompoundPathItem'){var sum=0,valid=true;for(var pi=0,pn=it.pathItems.length;pi<pn;pi++){var part=it.pathItems[pi];if(!part.filled||!part.closed||part.evenodd){valid=false;break;}sum+=part.area;}if(valid&&Math.abs(sum)>1e-6)return proof;}
                }catch(noArea){}
            }
            if(it.typename==='PathItem')return !it.guides&&it.filled&&rectangular(it)?proof:false;
            if(it.typename==='RasterItem'||it.typename==='PlacedItem')return proof;
            if(it.typename==='TextFrame')return it.contents.length>0&&b[0]>=clip[0]&&b[1]>=clip[1]&&b[2]<=clip[2]&&b[3]<=clip[3]?proof:false;
            return false;
        }
        var proof=witness(item,only);if(!proof)return null;box=proof;
        return {rings:[[[box[0],-box[1]],[box[2],-box[1]],[box[2],-box[3]],[box[0],-box[3]]]]};
    }
    function boardRegionData(d){
        var refs=[],n=d.pageItems.length;if(n>50000)throw Error('画板联动对象超过上限');
        function collectLayer(layer){if(!layer.visible)return;var items=layer.pageItems,count=items.length;for(var i=0;i<count;i++){var item=items[i];if(item.parent===layer&&!limits(item).hidden)refs.push({item:item});}var children=layer.layers;for(var j=0,len=children.length;j<len;j++)collectLayer(children[j]);}
        for(var li=0,ln=d.layers.length;li<ln;li++)collectLayer(d.layers[li]);
        var boards=[];for(var j=0;j<d.artboards.length;j++)boards.push({index:j,bounds:bounds(d.artboards[j].artboardRect)});
        var temp={},r=smartRegions(d,temp,refs,true,boards);
        return {refs:refs,nodes:r.groupRegions,boards:boards,signature:stringify([temp.smartSignatures,r.groupRegions,boards])};
    }
    function updateArtboards(d,cache,a){
        if(!(a.boards instanceof Array)||!a.boards.length)throw Error('请选择画板');var indexes=[],plans={},i,j;
        // 0.6.29 稿件缩放调整方式：画板缩放时设计稿按所选比例调整；出血模式要求有效文档出血。
        var scaleMode=a.scaleArtwork===true?(a.artworkScale||'direct'):null,bleedBox=[0,0,0,0];
        if(scaleMode&&!/^(direct|width|height|bleed-width|bleed-height|bleed-direct)$/.test(scaleMode))throw Error('未知稿件缩放调整方式');
        for(i=0;i<a.boards.length;i++)indexes.push(a.boards[i].index);checkedBoardIndexes(d,cache,indexes);
        if(scaleMode&&scaleMode.indexOf('bleed')===0){
            var bo=a.bleedOffsets;
            if(!(bo instanceof Array)||bo.length!==4)throw Error('按出血缩放需要有效的文档出血，请先同步或主动读取出血');
            for(i=0;i<4;i++)if(typeof bo[i]!=='number'||!isFinite(bo[i])||bo[i]<0)throw Error('按出血缩放需要有效的文档出血，请先同步或主动读取出血');
            bleedBox=bo;
        }
        function artworkScaleRatio(mode,oldSpan,newSpan,oldBleedSpan,newBleedSpan){
            if(mode==='width')return newSpan/oldSpan;
            if(mode==='bleed-width')return (newBleedSpan)/(oldBleedSpan);
            if(mode==='bleed-height')return (newBleedSpan)/(oldBleedSpan);
            return newSpan/oldSpan;
        }
        for(i=0;i<a.boards.length;i++){var p=a.boards[i],b=p.bounds;if(!(b instanceof Array)||b.length!==4)throw Error('画板范围无效');for(j=0;j<4;j++)if(typeof b[j]!=='number'||!isFinite(b[j])||Math.abs(b[j])>16348)throw Error('画板位置超出支持范围');positive(b[2]-b[0]);positive(b[3]-b[1]);var old=bounds(d.artboards[p.index].artboardRect);var oldW=old[2]-old[0],oldH=old[3]-old[1],newW=b[2]-b[0],newH=b[3]-b[1],sx=1,sy=1;
            if(scaleMode==='direct'){sx=newW/oldW;sy=newH/oldH;}
            else if(scaleMode==='width'){sx=newW/oldW;sy=sx;}
            else if(scaleMode==='height'){sy=newH/oldH;sx=sy;}
            else if(scaleMode==='bleed-width'){sx=artworkScaleRatio('bleed-width',oldW,newW,oldW+bleedBox[0]+bleedBox[2],newW+bleedBox[0]+bleedBox[2]);sy=sx;}
            else if(scaleMode==='bleed-height'){sy=artworkScaleRatio('bleed-height',oldH,newH,oldH+bleedBox[1]+bleedBox[3],newH+bleedBox[1]+bleedBox[3]);sx=sy;}
            else if(scaleMode==='bleed-direct'){sx=(newW+bleedBox[0]+bleedBox[2])/(oldW+bleedBox[0]+bleedBox[2]);sy=(newH+bleedBox[1]+bleedBox[3])/(oldH+bleedBox[1]+bleedBox[3]);}
            plans[p.index]={before:old,after:b,sx:sx,sy:sy,dx:(b[0]+b[2]-old[0]-old[2])/2,dy:(b[1]+b[3]-old[1]-old[3])/2};}
        var moving=[];
        for(i=0;i<indexes.length;i++){
            var boardPlan=plans[indexes[i]];
            if(a.scaleArtwork===true){moving.push(indexes[i]);}
            else if(a.moveArtwork===true){if(boardPlan.dx!==0||boardPlan.dy!==0){moving.push(indexes[i]);}}
        }
        var artwork=[],moved=[],changed=[];
        if(moving.length){
            var data=boardRegionData(d);
            if(!a.artworkAssignments){cache.boardGeometry=data.signature;var measured=resultEdit('已读取画板可见区域');measured.boardRegions=data.nodes;measured.ownershipBoards=data.boards;return measured;}
            if(!cache.boardGeometry||cache.boardGeometry!==data.signature||!(a.artworkAssignments instanceof Array)||a.artworkAssignments.length!==data.refs.length)throw Error('设计稿或画板已变化，请重新排列');
            var chosen={};for(i=0;i<moving.length;i++)chosen[moving[i]]=true;
            for(i=0;i<data.refs.length;i++){var owner=a.artworkAssignments[i];if(typeof owner!=='number'||owner%1||owner< -1||owner>=d.artboards.length)throw Error('画板归属无效');if(chosen[owner]){if(limits(data.refs[i].item).locked)throw Error('目标画板有锁定设计，请先解锁后再联动');artwork.push({item:data.refs[i].item,index:owner});}}
            cache.boardGeometry=null;
        }
        try{
            for(i=0;i<artwork.length;i++){var entry=artwork[i],plan=plans[entry.index];if(plan.sx===1&&plan.sy===1){entry.translationOnly=true;entry.dx=a.moveArtwork?plan.dx:0;entry.dy=a.moveArtwork?plan.dy:0;entry.item.translate(entry.dx,-entry.dy);moved.push(entry);continue;}var before=bounds(entry.item.geometricBounds),cx=(before[0]+before[2])/2,cy=(before[1]+before[3])/2,ox=(plan.before[0]+plan.before[2])/2+(bleedBox[2]-bleedBox[0])/2,oy=(plan.before[1]+plan.before[3])/2+(bleedBox[3]-bleedBox[1])/2;
                entry.cx=cx;entry.cy=cy;entry.scaled=false;moved.push(entry);
                if(plan.sx!==1||plan.sy!==1){entry.item.resize(plan.sx*100,plan.sy*100,true,true,true,true,Math.sqrt(plan.sx*plan.sy)*100,Transformation.CENTER);entry.scaled=true;}
                var after=bounds(entry.item.geometricBounds);entry.item.translate(ox+(cx-ox)*plan.sx+(a.moveArtwork?plan.dx:0)-(after[0]+after[2])/2,-(oy+(cy-oy)*plan.sy+(a.moveArtwork?plan.dy:0)-(after[1]+after[3])/2));}
            for(i=0;i<indexes.length;i++){var ix=indexes[i],next=plans[ix].after;d.artboards[ix].artboardRect=[next[0],-next[1],next[2],-next[3]];changed.push(ix);}
            geometryUndo=null;app.redraw();return resultEdit('已调整 '+indexes.length+' 个画板'+(a.moveArtwork||a.scaleArtwork?'，联动 '+moved.length+' 个设计对象':''),['artboard','geometry']);
        }catch(error){var rollback=false;for(i=changed.length-1;i>=0;i--)try{var old=plans[changed[i]].before;d.artboards[changed[i]].artboardRect=[old[0],-old[1],old[2],-old[3]];}catch(rb){rollback=true;}for(i=moved.length-1;i>=0;i--)try{var p=plans[moved[i].index];var e=moved[i];if(e.translationOnly){e.item.translate(-e.dx,e.dy);continue;}if(e.scaled)e.item.resize(100/p.sx,100/p.sy,true,true,true,true,100/Math.sqrt(p.sx*p.sy),Transformation.CENTER);var r=bounds(e.item.geometricBounds);e.item.translate(e.cx-(r[0]+r[2])/2,-(e.cy-(r[1]+r[3])/2));}catch(rb2){rollback=true;}if(rollback)return resultEdit('部分调整未能恢复，请检查稿件并使用 Illustrator 撤销',['artboard','geometry'],[{objectId:'artboards',reason:String(error)}]);throw error;}
    }
    function editLayers(d,refs,cache,a){
        var layers=editorLayers(d),target=null,i,j;for(i=0;i<layerRefs.length;i++)if(layerRefs[i].id===a.layerId)target=layerRefs[i].item;
        if(a.operation==='list'){var list=resultEdit('已读取图层');list.layers=layers;return list;}
        if(a.name!==undefined&&(typeof a.name!=='string'||!a.name.replace(/\s/g,'').length||a.name.length>200))throw Error('图层名称须为 1–200 字');if(a.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(a.color))throw Error('图层颜色无效');
        if(a.operation==='update'){
            if(!target)throw Error('图层已失效，请刷新');var done=false;
            try{if(a.name!==undefined){target.name=a.name;done=true;}if(a.color!==undefined){target.color=makeColor(a.color);done=true;}if(a.visible!==undefined){target.visible=!!a.visible;done=true;}if(a.locked!==undefined){target.locked=!!a.locked;done=true;}}
            catch(e){if(done)return resultEdit('部分图层属性更新失败',['layers'],[{objectId:a.layerId,reason:String(e)}]);throw e;}
            return resultEdit('图层已同步到 Illustrator',['layers']);
        }
        if(a.operation!=='create'&&a.operation!=='move')throw Error('未知图层操作');
        var roots=[];if(a.source==='artboards'){checkedBoardIndexes(d,cache,a.artboardIndexes);var entries=boardArtwork(d,a.artboardIndexes);for(i=0;i<entries.length;i++)roots.push(entries[i].item);}else if(a.source==='selection'){roots=exportRoots(refs);if(!roots.length)throw Error('请选择需要移动的对象');}else throw Error('请选择图层来源');
        if(a.operation==='move'&&!target)throw Error('请选择有效的目标图层');
        if(target){var tl=limits(target);if(target.locked||!target.visible||tl.locked||tl.hidden)throw Error('目标图层或父图层已锁定／隐藏');}
        for(i=0;i<roots.length;i++){var item=roots[i],lim=limits(item);if(lim.hidden||lim.locked)throw Error('所选对象或父级已锁定／隐藏');var parent=item.parent;while(parent&&parent.typename!=='Document'){if(parent.typename==='GroupItem'&&parent.clipped)throw Error('请选择完整剪贴群组后移动，避免丢失剪切范围');if(parent.opacity!==100||parent.blendingMode!==BlendModes.NORMAL)throw Error('来源图层有整体外观，请先将外观归入完整群组');parent=parent.parent;}}
        if(target){var tp=target;while(tp&&tp.typename==='Layer'){if(tp.opacity!==100||tp.blendingMode!==BlendModes.NORMAL)throw Error('目标图层有整体外观，移动会改变设计');tp=tp.parent;}}
        var created=false,moved=0,skipped=[];
        try{if(a.operation==='create'){target=d.layers.add();created=true;target.name=a.name||'新图层';if(a.color)target.color=makeColor(a.color);}
            // Reverse traversal retains the selected roots' stacking order at the destination.
            for(i=roots.length-1;i>=0;i--){if(roots[i].parent===target)continue;roots[i].move(target,ElementPlacement.PLACEATBEGINNING);moved++;}
            d.activeLayer=target;geometryUndo=null;app.redraw();return resultEdit('已移动 '+moved+' 个对象至图层「'+target.name+'」',['layers','geometry']);
        }catch(error){if(moved||created){skipped.push({objectId:'layers',reason:String(error)});return resultEdit('已移动 '+moved+' 个对象，其余未完成，请检查图层',['layers','geometry'],skipped);}throw error;}
    }

    function nativeAlign(d,refs,a){
        if(String(app.version)!=='30.0.0')throw Error('当前版本的原生对齐未验证');
        if(!refs.length)throw Error('请选择需要对齐的对象');
        var map={'left':'Horizontal Align Left','h-center':'Horizontal Align Center','right':'Horizontal Align Right','top':'Vertical Align Top','v-center':'Vertical Align Center','bottom':'Vertical Align Bottom'},commands=[],i,target=null;
        if(a.referenceId){var ri=Number(String(a.referenceId).replace(/^s/,''));if(!/^s\d+$/.test(a.referenceId)||!refs[ri])throw Error('指定目标已失效');target=refs[ri].item;}
        // 多对象使用观察到的最后单次新增对象；单对象默认对齐画板。
        // 普通边界未观察到目标时保留原生关键对象及对齐选项；特殊测量不得冒充原生边界。
        else if(refs.length>1){for(i=0;i<refs.length;i++)if(refs[i].item===lastSelected)target=lastSelected;}
        if(a.distribute){if(a.distribute!=='horizontal'&&a.distribute!=='vertical')throw Error('分布方向无效');if(refs.length<(a.gap===undefined?3:2))throw Error(a.gap===undefined?'自动分布至少需要三个对象':'指定间距至少需要两个对象');}
        else{if(!(a.axes instanceof Array)||!a.axes.length||a.axes.length>2)throw Error('对齐方向无效');for(i=0;i<a.axes.length;i++)if(!map[a.axes[i]])throw Error('对齐方向无效');}
        if(a.gap!==undefined&&(typeof a.gap!=='number'||!isFinite(a.gap)||Math.abs(a.gap)>16348))throw Error('间距须在 ±16348 pt 内');
        // Boundary-aware callers must not silently fall back to menu preferences:
        // Illustrator's glyph/stroke/key-object preferences cannot be inferred here.
        var measured=null,useBounds=a.clip!==undefined||a.text!==undefined;
        if(useBounds){
            if(!/^(frame|visible)$/.test(a.clip)||!/^(frame|glyph)$/.test(a.text))throw Error('对齐边界设置无效');
            if(!a.distribute&&refs.length>1&&!target){
                if(a.clip==='visible'||a.text==='glyph')throw Error('精确边界对齐需要明确参考对象；请在“指定目标”选择对象，或关闭字形／可见边界后使用原生关键对象');
                useBounds=false;
            }
            if(useBounds)measured=measureLayout(d,refs,{clip:a.clip,text:a.text}).measuredObjects;
        }
        function layoutBounds(item){
            if(!measured)return editorBounds(item);
            for(var bi=0;bi<refs.length;bi++)if(refs[bi].item===item)return measured[bi].bounds;
            throw Error('对齐测量对象已失效');
        }
        // An unobserved selection may contain a native key object. Keep the native selection intact.
        // Never infer click order from stacking order.
        if(a.gap!==undefined&&!target){var gapAxis=a.distribute==='horizontal'?0:1;target=refs[0].item;for(i=1;i<refs.length;i++)if(layoutBounds(refs[i].item)[gapAxis]<layoutBounds(target)[gapAxis])target=refs[i].item;}
        var changed=0;
        try{
            if(!a.distribute&&(refs.length===1||target)){
                var rb=target?layoutBounds(target):bounds(d.artboards[d.artboards.getActiveArtboardIndex()].artboardRect);
                for(i=0;i<refs.length;i++){var item=refs[i].item;if(item===target)continue;var b=layoutBounds(item),dx=0,dy=0;
                    for(var ax=0;ax<a.axes.length;ax++){var mode=a.axes[ax];if(mode==='left')dx=rb[0]-b[0];if(mode==='right')dx=rb[2]-b[2];if(mode==='h-center')dx=(rb[0]+rb[2]-b[0]-b[2])/2;if(mode==='top')dy=rb[1]-b[1];if(mode==='bottom')dy=rb[3]-b[3];if(mode==='v-center')dy=(rb[1]+rb[3]-b[1]-b[3])/2;}item.translate(dx,-dy);changed++;
                }
            }else if(a.gap!==undefined){
                var axis=a.distribute==='horizontal'?0:1,list=[];for(i=0;i<refs.length;i++)list.push({item:refs[i].item,b:layoutBounds(refs[i].item)});list.sort(function(x,y){return x.b[axis]-y.b[axis];});var anchor=0;for(i=0;i<list.length;i++)if(list[i].item===target)anchor=i;
                var positions=[],cursor=0;for(i=0;i<list.length;i++){positions.push(cursor);cursor+=list[i].b[axis+2]-list[i].b[axis]+a.gap;}var origin=list[anchor].b[axis]-positions[anchor];
                for(i=0;i<list.length;i++){if(i===anchor)continue;var delta=origin+positions[i]-list[i].b[axis];list[i].item.translate(axis===0?delta:0,axis===1?-delta:0);changed++;}
            }else if(a.distribute&&measured){
                var axis=a.distribute==='horizontal'?0:1,end=axis+2,list=[];
                var gaps=a.spacing==='gaps'&&!a.edge;
                // Avoid chained ternaries: this ExtendScript runtime evaluates them
                // left-associatively, turning a start coordinate into an end/center.
                for(i=0;i<refs.length;i++){var measuredBox=layoutBounds(refs[i].item),position;
                    if(gaps||a.edge==='start')position=measuredBox[axis];else if(a.edge==='end')position=measuredBox[end];else position=(measuredBox[axis]+measuredBox[end])/2;
                    list.push({item:refs[i].item,b:measuredBox,coordinate:position});}
                list.sort(function(x,y){return x.coordinate-y.coordinate;});
                var total=0;for(i=0;i<list.length;i++)total+=list[i].b[end]-list[i].b[axis];
                var first=list[0].b,last=list[list.length-1].b;
                var step=gaps?(last[end]-first[axis]-total)/(list.length-1):(list[list.length-1].coordinate-list[0].coordinate)/(list.length-1);
                var cursor=list[0].coordinate;
                for(i=0;i<list.length;i++){
                    var delta=cursor-list[i].coordinate;
                    if(Math.abs(delta)>0.000001){list[i].item.translate(axis===0?delta:0,axis===1?-delta:0);changed++;}
                    cursor+=step+(gaps?list[i].b[end]-list[i].b[axis]:0);
                }
            }else{
                if(a.distribute){var ending='Center';if(a.edge==='start')ending=a.distribute==='horizontal'?'Left':'Top';if(a.edge==='end')ending=a.distribute==='horizontal'?'Right':'Bottom';commands.push((a.distribute==='horizontal'?'Horizontal':'Vertical')+' Distribute '+ending);}
                else for(i=0;i<a.axes.length;i++)commands.push(map[a.axes[i]]);
                if(a.distribute&&a.spacing==='gaps'&&!a.edge){deliveryAction('ai_plugin_alignPalette',[[1954115685,'enumerated',a.distribute==='horizontal'?14:13]]);changed++;}else for(i=0;i<commands.length;i++){app.executeMenuCommand(commands[i]);changed++;}
            }
            geometryUndo=null;app.redraw();return resultEdit('已完成对齐／分布',['geometry']);
        }catch(error){if(changed)return resultEdit('部分对齐／分布未完成，请检查并使用 Illustrator 撤销',['geometry'],[{objectId:'selection',reason:String(error)}]);throw error;}
    }

    function resultEdit(message,sideEffects,skipped){return {status:skipped&&skipped.length?'partial':'completed',selectedObjectIds:[],skipped:skipped||[],sideEffects:sideEffects||[],message:message,undoable:false};}
    function setItemBounds(item,target,scaleStrokes){
        var b=editorBounds(item),w=positive(b[2]-b[0]),h=positive(b[3]-b[1]),nw=positive(target[2]-target[0]),nh=positive(target[3]-target[1]);
        if(item.typename==='PathItem'){var geometry=pathGeometry(item),keys=['anchor','left','right'];for(var pi=0;pi<geometry.points.length;pi++){for(var pk=0;pk<keys.length;pk++){var xy=geometry.points[pi][keys[pk]];geometry.points[pi][keys[pk]]=[target[0]+(xy[0]-b[0])*nw/w,-(target[1]+(-xy[1]-b[1])*nh/h)];}}setGeometry(item,geometry);if(scaleStrokes&&item.stroked)item.strokeWidth*=Math.sqrt(nw/w*nh/h);return;}
        item.resize(nw/w*100,nh/h*100,true,true,true,true,scaleStrokes?100*Math.sqrt(nw/w*nh/h):100,Transformation.CENTER);
        b=editorBounds(item);item.translate((target[0]+target[2]-b[0]-b[2])/2,-(target[1]+target[3]-b[1]-b[3])/2);
    }
    function straightConvex(item){
        if(item.typename!=='PathItem'||!item.closed||item.clipping||item.pathPoints.length<3){return false;}var p=item.pathPoints,sign=0;
        for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length].anchor,c=p[(i+2)%p.length].anchor;if(String(a.anchor)!==String(a.leftDirection)||String(a.anchor)!==String(a.rightDirection)){return false;}var cross=(b[0]-a.anchor[0])*(c[1]-b[1])-(b[1]-a.anchor[1])*(c[0]-b[0]);if(Math.abs(cross)>0.00001){if(sign&&sign*cross<0){return false;}sign=cross;}}return sign!==0;
    }
    function symmetricPolygon(points,a){
        var axis=a.axis==='x'?0:1,pos=a.position,low=a.side==='low',out=[],i;
        function inside(p){return low?p[axis]<=pos:p[axis]>=pos;}
        for(i=0;i<points.length;i++){var p=points[i],q=points[(i+1)%points.length],pi=inside(p),qi=inside(q);if(pi){out.push(p);}if(pi!==qi){var t=(pos-p[axis])/(q[axis]-p[axis]);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
        if(out.length<3){throw Error('保留侧没有有效面积，请移动对称轴');}
        // Fuse along the axis edge; an axis outside the source would make two disconnected islands.
        var edge=-1;for(i=0;i<out.length;i++){if(Math.abs(out[i][axis]-pos)<0.00001&&Math.abs(out[(i+1)%out.length][axis]-pos)<0.00001){edge=i;break;}}
        if(edge<0){throw Error('对称轴需要穿过路径，才能融合成一个闭合图形');}
        var chain=[];for(i=0;i<out.length;i++){chain.push(out[(edge+1+i)%out.length]);}
        for(i=chain.length-2;i>0;i--){var r=[chain[i][0],chain[i][1]];r[axis]=2*pos-r[axis];chain.push(r);}
        return chain;
    }
    function symmetryEdit(d,sid,refs,a){
        var s=symmetrySession,i;
        if(s&&s.sid!==sid){throw Error('请切回对称预览的文档');}
        function removePreview(session){for(var j=0;j<session.outputs.length;j++){session.outputs[j].remove();}session.outputs=[];}
        function validate(session){for(var j=0;j<session.refs.length;j++){var r=session.refs[j];if(r.item.parent!==r.parent||editSignature(r.item)!==r.signature){throw Error('预览源对象已改变，请取消预览后重新选择');}}for(j=0;j<session.outputs.length;j++){if(editSignature(session.outputs[j])!==session.signatures[j]){throw Error('预览结果被编辑，请取消后重新开始');}}}
        if(a.phase==='cancel'){
            if(!s){return resultEdit('没有进行中的预览');}
            // Remove only plugin-owned output. The original artwork was never rewritten.
            removePreview(s);try{s.axisLayer.remove();}catch(missingAxis){}
            for(i=0;i<s.refs.length;i++){try{s.refs[i].item.hidden=false;s.refs[i].item.selected=true;}catch(missingSource){}}
            symmetrySession=null;app.redraw();return resultEdit('已取消，原图保持原样',['symmetry-cancel']);
        }
        if(a.phase==='commit'){
            if(!s){throw Error('请先开始预览');}validate(s);
            for(i=0;i<s.refs.length;i++){s.refs[i].item.remove();s.outputs[i].selected=true;}s.axisLayer.remove();symmetrySession=null;app.redraw();return resultEdit('已保留镜像组合（曲线与内部蒙版保持可编辑）',['symmetry-commit']);
        }
        if(a.phase==='sync'){
            if(!s){return resultEdit('预览已结束');}var axisBounds=bounds(s.axisItem.geometricBounds),pos=s.axis==='x'?(axisBounds[0]+axisBounds[2])/2:(axisBounds[1]+axisBounds[3])/2;
            if(Math.abs(pos-s.position)<0.01){return resultEdit('');}a={axis:s.axis,side:s.side,position:pos};
        }
        // An unchanged axis is a constant-size check. Only a requested rebuild validates all artwork.
        if(s){validate(s);}
        if((a.axis!=='x'&&a.axis!=='y')||(a.side!=='low'&&a.side!=='high')||!isFinite(a.position)){throw Error('对称参数无效');}
        if(!s){
            if(!refs.length){throw Error('请先选择需要对称的图形');}var expanded=[];
            for(i=0;i<refs.length;i++){var item=refs[i].item;
                if(item.typename==='PathItem'&&item.parent.typename==='CompoundPathItem'){item=item.parent;}
                if(((item.typename==='PathItem'&&item.clipping)||(item.typename==='CompoundPathItem'&&item.pathItems.length&&item.pathItems[0].clipping))&&item.parent.typename==='GroupItem'){item=item.parent;}
                if(['PathItem','GroupItem','CompoundPathItem','TextFrame','PlacedItem','RasterItem'].join('|').indexOf(item.typename)<0){throw Error('选区含不支持的对象类型：'+item.typename);}
                var duplicate=false;for(var n=0;n<expanded.length;n++){if(expanded[n].item===item){duplicate=true;}}if(!duplicate){expanded.push({item:item,parent:item.parent,signature:editSignature(item)});}
            }var roots=[];for(i=0;i<expanded.length;i++){var contained=false,ancestor=expanded[i].item.parent;while(ancestor&&ancestor.typename!=='Document'){for(var ri=0;ri<expanded.length;ri++){if(ancestor===expanded[ri].item){contained=true;}}ancestor=ancestor.parent;}if(!contained){roots.push(expanded[i]);}}expanded=roots;validRefs(expanded);s={sid:sid,refs:expanded,outputs:[],signatures:[],extent:unionBounds(refsToItems(expanded))};
        }
        var extent=s.extent,k=a.axis==='x'?0:1,keep=a.side==='low';if((keep&&a.position<=extent[k])||(!keep&&a.position>=extent[k+2])){throw Error('保留侧没有内容，请将轴移入图形范围');}
        performanceCounts.symmetryRebuilds++;var newOutputs=[];
        try{
            for(i=0;i<s.refs.length;i++){
                var original=s.refs[i].item,output=original.parent.groupItems.add();output.move(original,ElementPlacement.PLACEBEFORE);newOutputs.push(output);output.name='AIQ 对称组合';
                var half=output.groupItems.add(),copy=original.duplicate(half,ElementPlacement.PLACEATEND);copy.hidden=false;copy.locked=false;
                var b=bounds(original.visibleBounds),pad=Math.max(b[2]-b[0],b[3]-b[1],100)+10;
                var clip=[b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad];if(keep){clip[k+2]=a.position;}else{clip[k]=a.position;}
                if(clip[2]<=clip[0]||clip[3]<=clip[1]){throw Error('某个对象在保留侧没有内容，请分别处理');}
                var mask=half.pathItems.rectangle(-clip[1],clip[0],clip[2]-clip[0],clip[3]-clip[1]);mask.filled=false;mask.stroked=false;mask.clipping=true;half.clipped=true;
                var mirror=half.duplicate(output,ElementPlacement.PLACEATEND),before=bounds(mirror.geometricBounds);
                mirror.resize(a.axis==='x'?-100:100,a.axis==='y'?-100:100,true,true,true,true,100,Transformation.CENTER);
                var after=bounds(mirror.geometricBounds),target=a.axis==='x'?2*a.position-before[2]:2*a.position-before[3];mirror.translate(a.axis==='x'?target-after[0]:0,a.axis==='y'?-(target-after[1]):0);
            }
        }catch(buildError){for(i=0;i<newOutputs.length;i++){newOutputs[i].remove();}throw buildError;}
        if(symmetrySession){removePreview(s);}else{
            s.axisLayer=d.layers.add();s.axisLayer.name='AIQ 临时对称轴 · 拖动预览';s.axisLayer.printable=false;s.axisItem=s.axisLayer.pathItems.add();s.axisItem.name='拖动此线调整对称轴';s.axisItem.filled=false;s.axisItem.stroked=true;s.axisItem.strokeWidth=1;s.axisItem.strokeColor=makeColor('#f2ae62');
            for(i=0;i<s.refs.length;i++){s.refs[i].item.hidden=true;s.refs[i].signature=editSignature(s.refs[i].item);}
        }
        s.outputs=newOutputs;s.signatures=[];for(i=0;i<newOutputs.length;i++){s.signatures.push(editSignature(newOutputs[i]));}
        s.axis=a.axis;s.position=a.position;s.side=a.side;
        s.axisItem.setEntirePath(a.axis==='x'?[[a.position,-extent[1]+30],[a.position,-extent[3]-30]]:[[extent[0]-30,-a.position],[extent[2]+30,-a.position]]);s.axisItem.selected=true;
        symmetrySession=s;app.redraw();return resultEdit('拖动画布中的金色轴线，可继续调整',['symmetry-preview']);
    }
    function refsToItems(refs){var items=[];for(var i=0;i<refs.length;i++){items.push(refs[i].item);}return items;}
    // Vector copies are saved from an isolated document; the source never changes file identity.
    // Delivery v0.5. All files are produced in isolated documents from explicit targets.
    function documentUnit(d){
        var raw=d.rulerUnits,key=String(raw).replace('RulerUnits.','');
        var names=['Millimeters','Centimeters','Meters','Inches','Points','Pixels','Picas','Qs'];for(var u=0;u<names.length;u++)if(RulerUnits[names[u]]!==undefined&&raw===RulerUnits[names[u]]){key=names[u];break;}
        var map={Millimeters:'mm',Centimeters:'cm',Meters:'m',Inches:'in',Points:'pt',Pixels:'px',Picas:'pc',Qs:'Q'};
        return map[key];
    }
    function unitScale(unit){var map={mm:72/25.4,cm:72/2.54,m:72000/25.4,'in':72,pt:1,px:1,pc:12,Q:72/101.6};if(!map[unit]){throw Error('文档单位未识别，请刷新');}return map[unit];}
    function boardStamp(d){var out=[];for(var i=0;i<d.artboards.length;i++){out.push({index:i,name:d.artboards[i].name,bounds:bounds(d.artboards[i].artboardRect)});}return stringify(out);}
    function safeName(s){return String(s).replace(/[\\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').substr(0,150)||'对象';}
    function nextOutput(folder,stem,ext){var base=safeName(String(stem).replace(/\.(png|jpe?g|svg|pdf|ai|eps)$/i,'')),n=0,f;if(/^(png|jpg|svg)$/.test(ext)){base=base.replace(/ /g,'-');}do{f=new File(folder.fullName+'/'+encodeURIComponent(base+(n?'_'+n:'')+'.'+ext));n++;}while(f.exists||(ext==='eps'&&new File(folder.fullName+'/'+encodeURIComponent(base+(n>1?'_'+(n-1):'')+'-01.eps')).exists));return f;}
    function clippingPath(group){for(var i=0;i<group.pageItems.length;i++){var p=group.pageItems[i];if(p.parent!==group){continue;}if(p.typename==='PathItem'&&p.clipping){return p;}if(p.typename==='CompoundPathItem'){for(var j=0;j<p.pathItems.length;j++){if(p.pathItems[j].clipping){return p;}}}}return null;}
    function mergeBox(a,b){return a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]:b;}
    function intersectBox(a,b){var out=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];if(out[2]<=out[0]||out[3]<=out[1]){throw Error('所选对象在蒙版中没有可见范围');}return out;}
    function exportBounds(item){
        var box=null;
        if(item.typename==='GroupItem'){
            if(item.clipped){var mask=clippingPath(item);if(!mask){throw Error('无法读取剪切路径');}return bounds(mask.geometricBounds);}
            for(var i=0;i<item.pageItems.length;i++){var child=item.pageItems[i];if(child.parent===item&&!child.hidden){box=mergeBox(box,exportBounds(child));}}
            if(!box){throw Error('群组没有可见内容');}return box;
        }
        return bounds(item.visibleBounds);
    }
    function exportRoots(refs){
        var items=[],roots=[],i,j;
        for(i=0;i<refs.length;i++){var item=refs[i].item;if(item.typename==='PathItem'&&item.parent.typename==='CompoundPathItem'){item=item.parent;}
            if((item.typename==='PathItem'&&item.clipping)||(item.typename==='CompoundPathItem'&&item.pathItems.length&&item.pathItems[0].clipping)){if(item.parent.typename==='GroupItem'&&item.parent.clipped){item=item.parent;}}
            var seen=false;for(j=0;j<items.length;j++){if(items[j]===item){seen=true;}}if(!seen){items.push(item);}}
        for(i=0;i<items.length;i++){var parent=items[i].parent,contained=false;while(parent&&parent.typename!=='Document'){for(j=0;j<items.length;j++){if(parent===items[j]){contained=true;}}parent=parent.parent;}if(!contained){roots.push(items[i]);}}
        return roots;
    }
    function duplicatePosition(item,parent,placement){var pos=[item.position[0],item.position[1]],out=item.duplicate(parent,placement);out.position=pos;return out;}
    // Keep the color as plain text until creation: cached Illustrator enum objects can change across host property reads.
    var ownedDeliveryDocuments=[],deliverySnapshots=[];
    function releaseSnapshotFile(lease){
        if(lease.released&&lease.openDocuments===0&&lease.file&&lease.file.exists){if(!lease.file.remove())throw Error('导出快照清理失败');}
    }
    function forgetDeliverySnapshot(index){
        var snapshot=deliverySnapshots[index];
        if(snapshot.lease){if(!snapshot.closed){snapshot.lease.openDocuments--;snapshot.closed=true;}releaseSnapshotFile(snapshot.lease);}
        else if(snapshot.file.exists&&!snapshot.file.remove())throw Error('导出快照清理失败');
        deliverySnapshots.splice(index,1);
    }
    function closeDeliveryDocument(doc){
        var ownedIndex=-1;for(var i=ownedDeliveryDocuments.length-1;i>=0;i--)if(ownedDeliveryDocuments[i]===doc)ownedIndex=i;
        var snapshotIndex=-1;for(var cleanup=deliverySnapshots.length-1;cleanup>=0;cleanup--)if(deliverySnapshots[cleanup].doc===doc)snapshotIndex=cleanup;
        doc.close(SaveOptions.DONOTSAVECHANGES);
        if(ownedIndex>=0)ownedDeliveryDocuments.splice(ownedIndex,1);
        if(snapshotIndex>=0)forgetDeliverySnapshot(snapshotIndex);
    }
    function checkDeliveryDocuments(){
        for(var i=ownedDeliveryDocuments.length-1;i>=0;i--){var exists=false;for(var j=0;j<app.documents.length;j++)if(app.documents[j]===ownedDeliveryDocuments[i])exists=true;if(!exists)ownedDeliveryDocuments.splice(i,1);}
        for(i=deliverySnapshots.length-1;i>=0;i--){var live=false;for(j=0;j<app.documents.length;j++)if(app.documents[j]===deliverySnapshots[i].doc)live=true;if(!live)forgetDeliverySnapshot(i);}
        if(ownedDeliveryDocuments.length)throw Error('上次导出工作副本尚未关闭；请关闭该副本后重试，已停止继续创建文件');
    }
    function newDeliveryDocument(mode,width,height,bleed){var doc=app.documents.add(mode==='rgb'?DocumentColorSpace.RGB:DocumentColorSpace.CMYK,width,height);ownedDeliveryDocuments.push(doc);return doc;}
    // Native snapshot avoids hundreds of cross-document duplicate calls for dense text.
    function snapshotDeliveryDocument(source,mode,rects,names,lease){
        var file=lease.file,copy=null;
        try{
            if(!file){if(lease.progress)lease.progress.stage('snapshot','准备保护副本');file=new File(Folder.temp+'/AIQ_snapshot_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000)+'.ai');if(file.exists)throw Error('快照名称冲突');lease.file=file;savePackageCopy(source,file,false);lease.ready=true;lease.saves++;}
            if(!lease.ready||!file.exists||!file.length)throw Error('本批快照无效，已停止导出');
            if(lease.progress)lease.progress.stage('opening','打开保护副本');
            copy=app.open(file);ownedDeliveryDocuments.push(copy);lease.openDocuments++;deliverySnapshots.push({doc:copy,file:file,lease:lease});
            var plan=planDeliveryLayers(copy,rects,50000),keep={};
            function mark(p){for(var i=0;i<p.layers.length;i++){var entry=p.layers[i];for(var j=0;j<entry.items.length;j++)keep['$'+entry.items[j].uuid]=true;mark(entry);}}
            mark(plan);
            function prune(layer){var locked=layer.locked;layer.locked=false;try{for(var i=layer.pageItems.length-1;i>=0;i--){var item=layer.pageItems[i];if(item.parent===layer&&!keep['$'+item.uuid]){item.locked=false;item.remove();}}for(i=0;i<layer.layers.length;i++)prune(layer.layers[i]);}finally{layer.locked=locked;}}
            for(var i=0;i<copy.layers.length;i++)prune(copy.layers[i]);
            for(i=copy.artboards.length-1;i>0;i--)copy.artboards[i].remove();
            copy.artboards[0].artboardRect=rects[0];copy.artboards[0].name=names[0];
            for(i=1;i<rects.length;i++){var board=copy.artboards.add(rects[i]);board.name=names[i];}
            return copy;
        }catch(e){if(copy)closeDeliveryDocument(copy);throw e;}
    }
    function canSnapshotDelivery(d,a,mode){var same=mode===(String(d.documentColorSpace)==='DocumentColorSpace.CMYK'?'cmyk':'rgb');if(same&&a.outlineText&&d.textFrames.length>=50)return true;for(var i=0;i<d.textFrames.length;i++)if(d.textFrames[i].story.textFrames.length>1){if(!same)throw Error('串接文字导出请保持源颜色模式；当前不支持在同一导出调用中转换该故事的颜色模式');return true;}return false;}
    function copyExportObject(item,target){
        var box=exportBounds(item),copy=duplicatePosition(item,target.layers[0],ElementPlacement.PLACEATEND),parent=item.parent;
        while(parent&&parent.typename!=='Document'){
            if(parent.typename==='GroupItem'){
                if(parent.opacity!==100||parent.blendingMode!==BlendModes.NORMAL){throw Error('请选中带透明度或混合模式的完整父群组导出');}
                if(parent.clipped){var mask=clippingPath(parent);if(!mask){throw Error('无法读取父级蒙版');}box=intersectBox(box,bounds(mask.geometricBounds));var wrap=target.layers[0].groupItems.add();copy.move(wrap,ElementPlacement.PLACEATEND);duplicatePosition(mask,wrap,ElementPlacement.PLACEATBEGINNING);wrap.clipped=true;copy=wrap;}
            }parent=parent.parent;
        }
        return box;
    }
    // Only modifies our owned export document. AI saving does not clip to artboards.
    function restrictVectorDelivery(copy,rects){
        function intersects(item){
            var b=item.visibleBounds;
            if(item.typename==='GroupItem'&&item.clipped){var mask=clippingPath(item);if(!mask)throw Error('导出蒙版缺少剪切路径');b=mask.geometricBounds;}
            if(!b||b.length!==4)throw Error('无法确认导出对象边界');
            for(var r=0;r<rects.length;r++){var p=rects[r];if(b[2]>p[0]&&b[0]<p[2]&&b[1]>p[3]&&b[3]<p[1])return true;}return false;
        }
        function prune(parent){
            var items=parent.pageItems;
            for(var i=items.length-1;i>=0;i--){var item=items[i];if(item.parent!==parent)continue;
                if(item.typename==='PathItem'&&item.clipping||item.typename==='CompoundPathItem'&&item.pathItems.length&&item.pathItems[0].clipping)continue;
                // Removing a threaded frame reflows text. Retain its story and clip instead.
                if(item.typename==='TextFrame'&&item.story.textFrames.length>1)continue;
                var locked=item.locked,hidden=item.hidden;item.locked=false;item.hidden=false;
                if(!intersects(item)){item.remove();continue;}
                if(item.typename==='GroupItem')prune(item);
                item.hidden=hidden;item.locked=locked;
            }
        }
        function layer(source){
            var locked=source.locked,visible=source.visible;source.locked=false;source.visible=true;
            try{
                prune(source);
                var roots=[],i;for(i=0;i<source.pageItems.length;i++)if(source.pageItems[i].parent===source)roots.push(source.pageItems[i]);
                if(roots.length){
                    var wrap=source.groupItems.add();wrap.name='AIQ Export Scope';
                    for(i=0;i<roots.length;i++){var wasLocked=roots[i].locked,wasHidden=roots[i].hidden;roots[i].locked=false;roots[i].hidden=false;roots[i].move(wrap,ElementPlacement.PLACEATEND);roots[i].hidden=wasHidden;roots[i].locked=wasLocked;}
                    // Illustrator's scripting setter requires a PathItem on top.
                    // Retraced zero-area bridges join disjoint rectangles; nonzero
                    // winding preserves their union, including overlapping boards.
                    var clip=wrap.pathItems.add(),points=[],origin=[rects[0][0],rects[0][1]];clip.name='AIQ Artboard Clip';
                    if(rects.length===1){var only=rects[0];points=[[only[0],only[1]],[only[2],only[1]],[only[2],only[3]],[only[0],only[3]]];}
                    else{points.push(origin);for(i=0;i<rects.length;i++){var r=rects[i];points.push([r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]],[r[0],r[1]],origin);}}
                    clip.setEntirePath(points);clip.closed=true;clip.stroked=false;clip.filled=false;clip.evenodd=false;
                    clip.clipping=true;clip.move(wrap,ElementPlacement.PLACEATBEGINNING);wrap.clipped=true;
                }
                for(i=0;i<source.layers.length;i++)layer(source.layers[i]);
            }finally{source.visible=visible;source.locked=locked;}
        }
        for(var i=0;i<copy.layers.length;i++)layer(copy.layers[i]);
    }
    function copyDeliveryLayer(source,parent){
        var layer=parent.layers.add();layer.name=source.name;layer.opacity=source.opacity;layer.blendingMode=source.blendingMode;
        for(var i=0;i<source.pageItems.length;i++){if(source.pageItems[i].parent===source){duplicatePosition(source.pageItems[i],layer,ElementPlacement.PLACEATEND);}}
        for(i=source.layers.length-1;i>=0;i--){copyDeliveryLayer(source.layers[i],layer);}layer.visible=source.visible;layer.locked=source.locked;return layer;
    }
    // Collection order follows native sibling collections (front to back).
    // zOrderPosition can throw Internal error after reopening layered AI files.
    function deliveryStackOrder(item){
        var order=[],cursor=item,depth=0;
        while(cursor&&cursor.typename!=='Document'&&depth++<100){
            var parent=cursor.parent,siblings=cursor.typename==='Layer'?parent.layers:parent.pageItems,found=-1;
            for(var i=0;i<siblings.length;i++)if(siblings[i]===cursor){found=i;break;}
            if(found<0)throw Error('无法确认合集对象的叠放顺序');order.unshift(found);cursor=parent;
        }
        if(!cursor||cursor.typename!=='Document')throw Error('合集对象层级无效');return order;
    }
    // Plan once before creating any document. Keep complete groups, threaded stories and
    // unknown objects; only exclude readable independent leaves outside every output area.
    function planDeliveryLayers(doc,rects,limit){
        var total=0,scanned=0;
        function wanted(item){
            if(!/^(PathItem|CompoundPathItem|TextFrame|PlacedItem|RasterItem)$/.test(item.typename))return true;
            try{if(item.typename==='TextFrame'&&item.story.textFrames.length>1)return true;var b=item.visibleBounds;
                if(!b||b.length!==4||!isFinite(b[0])||!isFinite(b[1])||!isFinite(b[2])||!isFinite(b[3]))return true;
                for(var r=0;r<rects.length;r++){var box=rects[r];if(b[2]>=box[0]&&b[0]<=box[2]&&b[1]>=box[3]&&b[3]<=box[1])return true;}return false;
            }catch(unknown){return true;}
        }
        function count(item){total++;if(total>limit)throw Error('本批工作副本超过 '+limit+' 个对象，请减少画板或选区');if(item.typename==='GroupItem'){var children=item.pageItems,size=children.length;for(var n=0;n<size;n++){var child=children[n];if(child.parent===item)count(child);}}}
        function layer(source){var plan={source:source,items:[],layers:[]};
            var children=source.pageItems,size=children.length;
            for(var i=0;i<size;i++){if(++scanned>200000)throw Error('本批图层遍历超过上限，请拆分稿件');var item=children[i];if(item.parent===source&&wanted(item)){count(item);plan.items.push(item);}}
            for(i=source.layers.length-1;i>=0;i--){var sub=layer(source.layers[i]);if(sub.items.length||sub.layers.length)plan.layers.push(sub);}return plan;
        }
        var plans=[];for(var i=doc.layers.length-1;i>=0;i--){var p=layer(doc.layers[i]);if(p.items.length||p.layers.length)plans.push(p);}return {layers:plans,objectCount:total};
    }
    function copyDeliveryPlan(plan,parent){
        for(var i=0;i<plan.layers.length;i++){var entry=plan.layers[i],source=entry.source,layer=parent.layers.add();layer.name=source.name;layer.opacity=source.opacity;layer.blendingMode=source.blendingMode;
            for(var j=0;j<entry.items.length;j++)duplicatePosition(entry.items[j],layer,ElementPlacement.PLACEATEND);
            copyDeliveryPlan(entry,layer);layer.visible=source.visible;layer.locked=source.locked;
        }
    }
    function clearDeliveryDocument(doc){
        doc.activate();
        // A recyclable worker always retains one empty layer. Do not lose a failed worker.
        var old=[];for(var i=0;i<doc.layers.length;i++)old.push(doc.layers[i]);doc.layers.add();
        for(i=old.length-1;i>=0;i--){old[i].locked=false;old[i].visible=true;old[i].remove();}
    }
    function checkRasterPixels(pw,ph){
        var actual=pw+' × '+ph+' 像素（'+(pw*ph/1000000).toFixed(2)+' 百万像素）';
        if(pw>30000||ph>30000)throw Error(actual+'，单边超过 30000 像素；请降低倍率或 PPI');
        if(pw*ph>100000000)throw Error(actual+'，总像素超过 1 亿上限（单边未超过 30000）；请降低倍率或 PPI');
    }
    function preflightDeliveryRect(rect,a,dpi){
        var ratio=(a.scale===undefined?100:a.scale)/100,w=(rect[2]-rect[0])*ratio,h=(rect[1]-rect[3])*ratio;
        positive(w);positive(h);if(w>16348||h>16348)throw Error('成品尺寸超过普通画布范围');
        if(/^(png|jpeg|tif|psd)$/.test(a.format)){var pw=Math.ceil(w*dpi/72),ph=Math.ceil(h*dpi/72);checkRasterPixels(pw,ph);}
    }
    function canDirectDelivery(doc,a,dpi,color,bleedSides){
        if(a.overprintBlack||a.outlineText&&a.format!=='svg')return false;
        if(/^(tif|psd)$/.test(a.format)){
            if(a.scale!==undefined&&a.scale!==100)return false;
            // These encoders include document bleed even when artboard clipping is set.
            // Never change source settings merely to make an output fit.
            var storedBleed;try{storedBleed=documentBleed(doc);}catch(noBleed){return false;}
            for(var bi=0;bi<4;bi++)if(storedBleed[bi])return false;
        }else if(a.format==='svg'){
            // The native encoder outlines only its output; source text remains editable.
        }else if(a.format==='jpeg'){
            // Avoid action-palette JPEG on the source: it adds an empty undo step.
            // RGB uses native PNG pixels plus WIC; CMYK requires a matching source.
            if(!canBatchScreens(doc,a,color))return false;
            // Encode more/fewer pixels without changing any source geometry.
            var encodedPPI=dpi*(a.scale===undefined?100:a.scale)/100;
            if(encodedPPI<1||encodedPPI>2400)return false;
        }else if(!/^(png|jpeg)$/.test(a.format)||color!=='rgb')return false;
        for(var i=0;i<4;i++)if(bleedSides[i])return false;
        if(a.screenExport===true)return color==='rgb'&&/^(png|jpeg)$/.test(a.format);
        // Preserve the previous effect-resolution semantics without changing the source.
        try{return Math.abs(doc.rasterEffectSettings.resolution-dpi)<0.001;}catch(noResolution){return false;}
    }
    function saveDirectDelivery(doc,index,out,a,dpi,rect){
        preflightDeliveryRect(rect,a,dpi);doc.artboards.setActiveArtboardIndex(index);
        if(a.format==='tif'||a.format==='psd'){saveDeliveryRaster(doc,out,a,dpi,index);return;}
        var ratio=(a.scale===undefined?100:a.scale)/100;
        if(a.format==='svg'){saveDirectSVG(doc,index,out,a,rect,ratio);return;}
        var jpegCMYK=false;
        if(a.colorMode==='cmyk')jpegCMYK=true;
        else if(a.colorMode!=='rgb'){if(String(doc.documentColorSpace)==='DocumentColorSpace.CMYK')jpegCMYK=true;}
        if(a.format==='jpeg'){cmykJPEG(doc,out,dpi*ratio,a.quality===undefined?100:a.quality,index,jpegCMYK?2:1);deliveryMetadata(out,'jpeg',dpi,rect);return;}
        if(a.format==='png'){saveDirectPNG(doc,index,out,a,dpi*ratio);deliveryMetadata(out,'png',dpi,rect);return;}
        throw Error('不支持的直接输出格式');
    }
    function nativeRGBJPEG(png,out,quality){
        var nonce='';for(var n=0;n<32;n++)nonce+='0123456789abcdef'.charAt(Math.floor(Math.random()*16));
        var input=new File(Folder.temp.fsName+'/AIQJPEG-'+nonce+'.png'),jpeg=new File(Folder.temp.fsName+'/AIQJPEG-'+nonce+'.jpg'),reply=new File(Folder.temp.fsName+'/AIQNative-'+nonce+'.json');
        if(input.exists||jpeg.exists||reply.exists||out.exists)throw Error('图片编码临时名称冲突');
        try{
            if(!png.copy(input.fsName))throw Error('无法准备 RGB JPEG 像素');
            app.sendScriptMessage('AIQNative','jpeg-file:'+nonce+':'+quality,'');
            if(!reply.exists||reply.length>2048||!reply.open('r'))throw Error('RGB JPEG 编码模块不可用，请完整安装后重启 Illustrator');
            var raw;try{raw=reply.read();}finally{reply.close();}
            var result=eval('('+raw+')');if(!result.ok||result.protocol!==1||result.color!=='rgb'||!jpeg.exists||!jpeg.length)throw Error('RGB JPEG 编码失败');
            if(out.exists||!jpeg.copy(out.fsName))throw Error('无法写入 RGB JPEG 文件');
        }finally{if(input.exists)input.remove();if(jpeg.exists)jpeg.remove();if(reply.exists)reply.remove();}
    }
    function screenDeliveryType(a,color){
        if(a.format==='png')return color==='rgb'?ExportForScreensType.SE_PNG24:null;
        if(a.format!=='jpeg')return null;
        if(color==='rgb')return ExportForScreensType.SE_PNG24; // RGB JPEG: native pixels, WIC compression outside document/undo.
        var q=a.quality===undefined?100:a.quality;
        if(q===100)return ExportForScreensType.SE_JPEG100;
        if(q===80)return ExportForScreensType.SE_JPEG80;
        if(q===50)return ExportForScreensType.SE_JPEG50;
        if(q===20)return ExportForScreensType.SE_JPEG20;
        return null; // Never round the user's quality to a different native preset.
    }
    function canBatchScreens(doc,a,color){
        if(screenDeliveryType(a,color)===null)return false;
        // Native screen JPEG keeps source CMYK. RGB is encoded via PNG + WIC,
        // never via an action-palette command or a source color conversion.
        return color==='rgb'||String(doc.documentColorSpace)==='DocumentColorSpace.CMYK';
    }
    function screenBatchEnd(pages,start){
        var names={},end=start;
        // Bounded batches allow cancel checks between native calls. Ambiguous names
        // are exported singly without renaming the source document's artboards.
        for(var i=start;i<pages.length&&i<start+8;i++){
            var name=pages[i].name,key='$'+name.toLowerCase();
            if(!name||name.length>100||/^[ .]|[ .]$|[<>:"\/\\|?*\x00-\x1f]/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||names[key])break;
            names[key]=true;end=i+1;
        }
        return Math.max(start+1,end);
    }
    function clearScreenBatch(batch){
        if(!batch||!batch.dir)return;
        var owned=batch.dir.getFiles();for(var k=0;k<owned.length;k++)if(owned[k] instanceof File)owned[k].remove();
        batch.dir.remove();batch.dir=null;
    }
    function createScreenBatch(doc,pages,start,a,dpi,color){
        var end=screenBatchEnd(pages,start),kind=screenDeliveryType(a,color),indexes=[],i,rgbJPEG=a.format==='jpeg'&&color==='rgb',ext=a.format==='jpeg'&&!rgbJPEG?'jpg':'png';
        if(kind===null)throw Error('屏幕输出格式、颜色或 JPEG 品质不受支持');
        for(i=start;i<end;i++)indexes.push(pages[i].index+1);
        var o=a.format==='jpeg'&&!rgbJPEG?new ExportForScreensOptionsJPEG():new ExportForScreensOptionsPNG24();
        o.antiAliasing=AntiAliasingMethod.ARTOPTIMIZED;o.scaleType=ExportForScreensScaleType.SCALEBYRESOLUTION;o.scaleTypeValue=dpi*(a.scale===undefined?100:a.scale)/100;
        if(a.format==='jpeg'&&!rgbJPEG)o.embedICCProfile=true;else{o.transparency=rgbJPEG?false:a.transparent!==false;o.backgroundBlack=false;}
        var items=new ExportForScreensItemToExport();items.artboards=indexes.join(',');items.document=false;
        var batch={dir:new Folder(Folder.temp+'/AIQ_screen_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000)),end:end,files:[]};
        if(batch.dir.exists||!batch.dir.create())throw Error('无法创建屏幕输出暂存目录');
        try{
            doc.exportForScreens(batch.dir,kind,o,items);
            var found=batch.dir.getFiles('*.'+ext);
            if(found.length!==end-start)throw Error('屏幕输出文件数量与所选画板不一致');
            for(i=start;i<end;i++){
                var expected=pages[i].name+'.'+ext,match=null;
                if(end-start===1)match=found[0];
                else for(var j=0;j<found.length;j++)if(decodeURI(found[j].name)===expected){if(match)throw Error('屏幕输出文件名冲突');match=found[j];}
                if(!match||!match.length)throw Error('无法确认屏幕输出与画板的对应关系');
                batch.files[i]=match;
            }
            return batch;
        }catch(error){clearScreenBatch(batch);throw error;}
    }
    function saveDirectPNG(doc,index,out,a,ppi){
        var o=new ExportForScreensOptionsPNG24();o.transparency=a.transparent!==false;o.backgroundBlack=false;o.antiAliasing=AntiAliasingMethod.ARTOPTIMIZED;o.scaleType=ExportForScreensScaleType.SCALEBYRESOLUTION;o.scaleTypeValue=ppi;
        var items=new ExportForScreensItemToExport();items.artboards=String(index+1);items.document=false;
        var dir=new Folder(Folder.temp+'/AIQ_png_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000));
        if(dir.exists||!dir.create())throw Error('无法创建 PNG 输出暂存目录');
        try{doc.exportForScreens(dir,ExportForScreensType.SE_PNG24,o,items);
            var found=dir.getFiles('*.png'),attempts=0;while((found.length!==1||!found[0].length)&&attempts++<12){$.sleep(250);found=dir.getFiles('*.png');}
            if(found.length!==1||!found[0].length||out.exists||!found[0].copy(out.fsName))throw Error('未生成唯一有效 PNG 文件');
        }finally{var owned=dir.getFiles();for(var k=0;k<owned.length;k++)if(owned[k] instanceof File)owned[k].remove();dir.remove();}
    }
    function saveDirectSVG(doc,index,out,a,rect,ratio){
        var o=new ExportForScreensOptionsWebOptimizedSVG();o.svgResponsive=false;o.coordinatePrecision=3;o.rasterImageLocation=RasterImageLocation.EMBED;
        if(a.outlineText)o.fontType=SVGFontType.OUTLINEFONT;
        var items=new ExportForScreensItemToExport();items.artboards=String(index+1);items.document=false;
        var dir=new Folder(Folder.temp+'/AIQ_svg_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000));
        if(dir.exists||!dir.create())throw Error('无法创建 SVG 输出暂存目录');
        try{
            doc.exportForScreens(dir,ExportForScreensType.SE_SVG,o,items);
            var attempts=0,found=dir.getFiles('*.svg');
            while((found.length!==1||!found[0].length)&&attempts++<12){$.sleep(250);found=dir.getFiles('*.svg');}
            if(found.length!==1||!found[0].length||out.exists||!found[0].copy(out.fsName))throw Error('未生成唯一有效 SVG 文件');
            // Keep the native viewBox; physical size scales the complete rendered output.
            deliveryMetadata(out,'svg',72,[0,(rect[1]-rect[3])*ratio,(rect[2]-rect[0])*ratio,0]);
        }finally{var owned=dir.getFiles();for(var k=0;k<owned.length;k++)if(owned[k] instanceof File)owned[k].remove();dir.remove();}
    }
    function deliveryProgress(a,total){
        if(!a.jobId)return null;
        if(typeof a.jobId!=='string'||! /^[a-zA-Z0-9_-]{8,80}$/.test(a.jobId))throw Error('导出任务编号无效');
        var dir=new Folder(Folder.userData+'/AIQ-Workbench');if(!dir.exists&&!dir.create())throw Error('无法建立导出进度目录');
        var file=new File(dir.fullName+'/export-'+a.jobId+'.json'),cancel=new File(dir.fullName+'/export-'+a.jobId+'.cancel');
        if(file.exists)throw Error('导出任务编号已使用，请重新发起');
        var state={jobId:a.jobId,total:total,current:0,completed:0,failed:0,status:'running',completedIndexes:[]};
        function write(){file.encoding='UTF-8';if(!file.open('w'))throw Error('无法保存导出进度');try{file.write(stringify(state));}finally{file.close();}}
        write();var initialWrite=write;write=function(){try{initialWrite();}catch(recordError){state.recordFailed=true;}};return {state:state,step:function(n){if(cancel.exists){state.status='cancelled';write();return false;}state.current=n;write();return true;},done:function(index){state.completedIndexes.push(index);state.completed=state.completedIndexes.length;write();},finish:function(failed,hadErrors){state.failed=failed;if(state.status!=='cancelled')state.status=failed||hadErrors?(state.completed?'partial':'failed'):'completed';write();if(cancel.exists)cancel.remove();}};
    }
    function annotationColors(d,rect){
        var entries={},list=[],unknown=0;
        function add(c){if(!c||c.typename==='NoColor'){return;}var label='';function n(x){return Math.round(x*100)/100;}
            if(c.typename==='RGBColor'){label='RGB '+n(c.red)+'/'+n(c.green)+'/'+n(c.blue);}
            else if(c.typename==='CMYKColor'){label='CMYK '+n(c.cyan)+'/'+n(c.magenta)+'/'+n(c.yellow)+'/'+n(c.black);}
            else if(c.typename==='SpotColor'){label='专色 '+c.spot.name+' '+n(c.tint)+'%';}
            else if(c.typename==='GrayColor'){label='Gray '+n(c.gray)+'%';}else{unknown++;return;}
            if(!entries[label]){entries[label]={label:label,count:0,color:color(c)};if(c.typename==='SpotColor')entries[label].color.spotBase=color(c.spot.color);list.push(entries[label]);}entries[label].count++;
        }
        for(var i=0;i<d.pageItems.length;i++){var p=d.pageItems[i];if(limits(p).hidden){continue;}var b;try{b=exportBounds(p);var ancestor=p.parent;while(ancestor&&ancestor.typename!=='Document'){if(ancestor.typename==='GroupItem'&&ancestor.clipped){var clip=clippingPath(ancestor);if(clip)b=intersectBox(b,bounds(clip.geometricBounds));}ancestor=ancestor.parent;}}catch(noBounds){unknown++;continue;}if(b[2]<=rect[0]||b[0]>=rect[2]||b[3]<=rect[1]||b[1]>=rect[3]){continue;}
            if(p.typename==='PathItem'&&!p.clipping){if(p.filled)add(p.fillColor);if(p.stroked)add(p.strokeColor);}
            else if(p.typename==='TextFrame'){for(var t=0;t<p.characters.length;t++){add(p.characters[t].characterAttributes.fillColor);add(p.characters[t].characterAttributes.strokeColor);}}
            else if(p.typename!=='GroupItem'&&p.typename!=='CompoundPathItem'){unknown++;}}
        list.sort(function(a,b){return b.count-a.count;});var labels=[];for(var j=0;j<Math.min(4,list.length);j++){labels.push(list[j].label);}return {labels:labels,entries:list.slice(0,4),unknown:unknown,total:list.length};
    }
    function annotationPrecision(opt){var n=opt.decimals===undefined?4:opt.decimals;if(typeof n!=='number'||n%1||n<0||n>5)throw Error('标注小数位数须为 0–5');return n;}
    function annotationInk(opt){var value=opt.color===undefined?'#2364c8':opt.color;if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error('标注颜色须为 #RRGGBB');return makeColor(value);}
    function annotationFont(text,size){text.textRange.characterAttributes.size=size;text.textRange.characterAttributes.autoLeading=false;text.textRange.characterAttributes.leading=size*1.35;var candidates=['MicrosoftYaHei','MicrosoftYaHeiUI','SimHei','ArialMT'];for(var i=0;i<candidates.length;i++)try{text.textRange.characterAttributes.textFont=app.textFonts.getByName(candidates[i]);break;}catch(noFont){}}
    function annotationColor(d,spec){var c,v=spec.values;if(spec.kind==='rgb'){c=new RGBColor();c.red=v[0];c.green=v[1];c.blue=v[2];}else if(spec.kind==='process-cmyk'){c=new CMYKColor();c.cyan=v[0];c.magenta=v[1];c.yellow=v[2];c.black=v[3];}else if(spec.kind==='gray'){c=new GrayColor();c.gray=v[0];}else if(spec.kind==='spot'||spec.kind==='spot-tint'){c=new SpotColor();var spot;try{spot=d.spots.getByName(spec.name);}catch(missing){spot=d.spots.add();spot.name=spec.name;spot.colorType=ColorModel.SPOT;spot.color=annotationColor(d,spec.spotBase);}c.spot=spot;c.tint=v[0];}else throw Error('无法创建该颜色的色块');return c;}
    function annotationSwatches(d,parent,label,lines,colors,size){if(!colors||!colors.entries)return;var vb=label.visibleBounds;for(var i=0;i<colors.entries.length;i++){var entry=colors.entries[i],lineIndex=-1;for(var j=0;j<lines.length;j++)if(lines[j]===entry.label)lineIndex=j;if(lineIndex<0)continue;var side=size*.8,p=parent.pathItems.rectangle(vb[1]-lineIndex*size*1.35,vb[2]+size*.5,side,side);p.name='色块 '+entry.label;p.stroked=false;p.filled=true;p.fillColor=annotationColor(d,entry.color);}}
    function addDeliveryLabel(copy,page,index,a,dpi,bleed){
        var opt=a.annotation;if(!opt||!opt.enabled)return;var decimals=annotationPrecision(opt),unit=page.unit,factor=unitScale(unit),rect=copy.artboards[index].artboardRect,b=bounds(rect),lines=[],labelRatio=1;if(a.type==='export')labelRatio=(a.scale===undefined?100:a.scale)/100;
        function f(n){return (n*labelRatio/factor).toFixed(decimals);}
        var nb=page.nameRect?bounds(page.nameRect):b;
        if(opt.size)lines.push('尺寸 '+f(nb[2]-nb[0])+' × '+f(nb[3]-nb[1])+' '+unit);
        if(opt.area)lines.push('边界面积 '+((nb[2]-nb[0])*(nb[3]-nb[1])*labelRatio*labelRatio/(factor*factor)).toFixed(decimals)+' '+unit+'²');
        if(opt.resolution)lines.push((a.type==='annotate'?'栅格效果设定 ':'导出栅格设定 ')+dpi+' ppi');
        if(opt.bleed)lines.push('要求出血 '+f(bleed)+' '+unit);
        if(opt.remark){if(typeof opt.remark!=='string'||opt.remark.length>500)throw Error('备注最多 500 字');lines.push('备注 '+opt.remark.replace(/[\r\n]+/g,' '));}
        if(opt.colors){var colors=page.colors;lines.push('使用色（引用频次）'+(colors.labels.length?'':'无可解析纯色'));lines=lines.concat(colors.labels);if(colors.total>4)lines.push('另有 '+(colors.total-4)+' 种纯色');if(colors.unknown)lines.push('图片／渐变等未解析：'+colors.unknown);}
        if(!lines.length)throw Error('请至少选择一种标注内容');
        var inset=opt.offset/labelRatio;if(!isFinite(inset)||Math.abs(inset)>10000)throw Error('标注距边无效');
        annotationInk(opt);
        var layer=copy.layers.add();layer.name='AIQ 规格标注 '+(index+1);var group=layer.groupItems.add(),label=group.textFrames.add();if(a.type==='annotate')group.name='AIQ 标注｜画板 '+(index+1);label.contents=lines.join('\r');var size=(a.fontSize||8)/labelRatio;annotationFont(label,size);
        label.textRange.characterAttributes.fillColor=annotationInk(opt);
        if(opt.autoFont){var initial=label.visibleBounds,fit=Math.min((b[2]-b[0])*.9/(initial[2]-initial[0]+size*1.4),(b[3]-b[1])*.3/(initial[1]-initial[3]));size=Math.max(4,Math.min(300,size*fit));annotationFont(label,size);}
        if(opt.colors)annotationSwatches(copy,group,label,lines,page.colors,size);
        var vb=group.visibleBounds,w=vb[2]-vb[0],h=vb[1]-vb[3];if(a.type!=='annotate'&&(w+inset*2>b[2]-b[0]||h+inset*2>b[3]-b[1]))throw Error('标注超出画板，请减少内容或距边');
        var right=opt.position.indexOf('right')>=0,bottom=opt.position.indexOf('bottom')>=0;
        var left=right?rect[2]-w:rect[0],top=a.type==='annotate'?(bottom?rect[3]-inset:rect[1]+inset+h):(bottom?rect[3]+inset+h:rect[1]-inset);group.translate(left-vb[0],top-vb[1]);
    }

    function artboardLabelPosition(rect,w,h,position,offset){
        if(!/^(?:(top|bottom)-(left|right|center)|(left|right)-center)$/.test(position))throw Error('标注位置无效');
        if(position==='left-center')return [rect[0]-offset-w,(rect[1]+rect[3]+h)/2];
        if(position==='right-center')return [rect[2]+offset,(rect[1]+rect[3]+h)/2];
        var x=rect[0];
        if(position.indexOf('center')>=0)x=(rect[0]+rect[2]-w)/2;
        else if(position.indexOf('right')>=0)x=rect[2]-w;
        return [x,position.indexOf('bottom')>=0?rect[3]-offset:rect[1]+offset+h];
    }
    function addArtboardLabel(copy,page,index,a,dpi,bleed){
        var opt=a.annotation;if(!opt||!opt.enabled)return;var decimals=annotationPrecision(opt),unit=page.unit,factor=unitScale(unit),rect=copy.artboards[index].artboardRect,b=bounds(rect),lines=[],labelRatio=1;if(a.type==='export')labelRatio=(a.scale===undefined?100:a.scale)/100;
        function f(n){return (n*labelRatio/factor).toFixed(decimals);}
        var nb=page.nameRect?bounds(page.nameRect):b;
        if(opt.size)lines.push('尺寸 '+f(nb[2]-nb[0])+' × '+f(nb[3]-nb[1])+' '+unit);
        if(opt.area)lines.push('边界面积 '+((nb[2]-nb[0])*(nb[3]-nb[1])*labelRatio*labelRatio/(factor*factor)).toFixed(decimals)+' '+unit+'²');
        if(opt.resolution)lines.push((a.type==='annotate'?'栅格效果设定 ':'导出栅格设定 ')+dpi+' ppi');
        if(opt.bleed)lines.push('要求出血 '+f(bleed)+' '+unit);
        if(opt.remark){if(typeof opt.remark!=='string'||opt.remark.length>500)throw Error('备注最多 500 字');lines=lines.concat(('备注 '+opt.remark.replace(/\r\n|\n/g,'\r')).split('\r'));}
        if(opt.colors){var colors=page.colors;lines.push('使用色（引用频次）'+(colors.labels.length?'':'无可解析纯色'));lines=lines.concat(colors.labels);if(colors.total>4)lines.push('另有 '+(colors.total-4)+' 种纯色');if(colors.unknown)lines.push('图片／渐变等未解析：'+colors.unknown);}
        if(!lines.length)throw Error('请至少选择一种标注内容');
        var inset=opt.offset/labelRatio;if(!isFinite(inset)||Math.abs(inset)>10000)throw Error('标注距边无效');
        annotationInk(opt);
        var layer=copy.layers.add();layer.name='AIQ 规格标注 '+(index+1);var group=layer.groupItems.add(),label=group.textFrames.add();if(a.type==='annotate')group.name='AIQ 标注｜画板 '+(index+1);label.contents=lines.join('\r');var size=(a.fontSize||8)/labelRatio;annotationFont(label,size);
        label.textRange.characterAttributes.fillColor=annotationInk(opt);
        if(opt.position.indexOf('center')>=0){label.textRange.paragraphAttributes.justification=Justification.CENTER;app.redraw();}
        if(opt.autoFont){var initial=label.visibleBounds,fit=Math.min((b[2]-b[0])*.9/(initial[2]-initial[0]+size*1.4),(b[3]-b[1])*.3/(initial[1]-initial[3]));size=Math.max(4,Math.min(300,size*fit));annotationFont(label,size);}
        if(opt.colors)annotationSwatches(copy,group,label,lines,page.colors,size);
        var vb=group.visibleBounds,w=vb[2]-vb[0],h=vb[1]-vb[3];if(a.type!=='annotate'&&(w+inset*2>b[2]-b[0]||h+inset*2>b[3]-b[1]))throw Error('标注超出画板，请减少内容或距边');
        var placement=artboardLabelPosition(rect,w,h,opt.position,inset);group.translate(placement[0]-vb[0],placement[1]-vb[1]);
    }

    function annotateDocument(d,refs,cache,a){
        var unit=documentUnit(d),scale=unitScale(unit),opt=a.annotation||{},decimals=annotationPrecision(opt),offset=Number(opt.offset),fontSize=Number(a.fontSize),bleed=Number(a.bleedPoints),pages=[],boxes=[],i,j;
        if(unit!==cache.unit){throw Error('文档单位已改变，请重新读取');}
        if(!isFinite(offset)||Math.abs(offset)>10000||!isFinite(fontSize)||fontSize<4||fontSize>300||!isFinite(bleed)||bleed<0){throw Error('距离须在 ±10000 pt 内，出血非负，字号须为 4–300 pt');}
        if(!/^(?:(top|bottom)-(left|right|center)|(left|right)-center)$/.test(opt.position)){throw Error('标注位置无效');}
        annotationInk(opt);
        var dpi=d.rasterEffectSettings.resolution;
        if(a.target==='artboards'){
            if(boardStamp(d)!==cache.artboards){throw Error('画板已改变，请刷新');}var seen={};
            if(!(a.artboardIndexes instanceof Array)||!a.artboardIndexes.length){throw Error('请选择需要标注的画板');}
            for(i=0;i<a.artboardIndexes.length;i++){var ix=a.artboardIndexes[i];if(typeof ix!=='number'||ix%1||ix<0||ix>=d.artboards.length||seen[ix])throw Error('画板索引无效');seen[ix]=true;pages.push({index:ix,unit:unit,colors:opt.colors?annotationColors(d,bounds(d.artboards[ix].artboardRect)):null});}
        }else if(a.target==='objects'){
            if(!refs.length)throw Error('请选择需要标注的对象');
            if(!a.horizontal&&!a.vertical&&!opt.size&&!opt.resolution&&!opt.colors&&!opt.bleed&&!opt.area&&!opt.remark)throw Error('请选择标注内容');
            var roots=exportRoots(refs);for(i=0;i<roots.length;i++){var b=editorBounds(roots[i]);boxes.push({bounds:b,colors:opt.colors?annotationColors(d,b):null,item:roots[i]});}
        }else if(a.target==='gap'){
            if(refs.length!==2)throw Error('间隙标注需要选择两个对象');
            if(!a.horizontal&&!a.vertical)throw Error('请勾选水平间隙或垂直间隙');
            boxes.push({bounds:editorBounds(refs[0].item),colors:null,item:refs[0].item,partner:editorBounds(refs[1].item),partnerItem:refs[1].item});
        }else{throw Error('未知标注范围');}
        if(a.linkToObjects)for(i=0;i<boxes.length;i++)annotationLinkItems(boxes[i].partnerItem?[boxes[i].item,boxes[i].partnerItem]:[boxes[i].item]);
        var beforeLayers=d.layers.length,originalSelection=d.selection,count=0;
        try{
            if(a.target==='artboards'){
                for(i=0;i<pages.length;i++){addArtboardLabel(d,pages[i],pages[i].index,a,dpi,bleed);count++;}
            }else{
                var layer=d.layers.add();layer.name='AIQ 对象尺寸标注';var ink=annotationInk(opt);
                function f(value){return (value/scale).toFixed(decimals)+' '+unit;}
                function line(group,points){var p=group.pathItems.add();p.setEntirePath(points);p.filled=false;p.stroked=true;p.strokeWidth=0.5;p.strokeColor=ink;}
                function text(group,value,x,y){var t=group.textFrames.add();t.contents=value;annotationFont(t,fontSize);t.textRange.characterAttributes.fillColor=ink;try{t.textRange.characterAttributes.textFont=app.textFonts.getByName('MicrosoftYaHei');}catch(noFont){}t.position=[x,y];return t;}
                for(i=0;i<boxes.length;i++){
                    if(a.target==='gap'){
                        var box=boxes[i].bounds,other=boxes[i].partner;
                        var l1=box[0],r1=box[2],t1=-box[1],q1=-box[3],l2=other[0],r2=other[2],t2=-other[1],q2=-other[3];
                        var group=layer.groupItems.add(),tick=3,names=[];
                        if(a.vertical){
                            var ub=t1>=t2?q1:q2,lt=t1>=t2?t2:t1,gapV=ub-lt;
                            var ovL=Math.max(l1,l2),ovR=Math.min(r1,r2),gx=ovL<ovR?(ovL+ovR)/2:(Math.max(l1,l2,r1,r2)+Math.min(l1,l2,r1,r2))/2;
                            line(group,[[gx,ub],[gx,lt]]);
                            line(group,[[gx-tick,ub],[gx+tick,ub]]);
                            line(group,[[gx-tick,lt],[gx+tick,lt]]);
                            text(group,'垂直间隙 '+f(gapV),gx+tick+2,(ub+lt+fontSize)/2);
                            names.push('垂直间隙 '+f(gapV));
                        }
                        if(a.horizontal){
                            var le=l1<=l2?r1:r2,re=l1<=l2?l2:l1,gapH=re-le;
                            var ovT=Math.min(t1,t2),ovB=Math.max(q1,q2),gy=ovT>ovB?(ovT+ovB)/2:(Math.max(t1,t2,q1,q2)+Math.min(t1,t2,q1,q2))/2;
                            line(group,[[le,gy],[re,gy]]);
                            line(group,[[le,gy-tick],[le,gy+tick]]);
                            line(group,[[re,gy-tick],[re,gy+tick]]);
                            var gapLabel=text(group,'水平间隙 '+f(gapH),0,0),gapLabelBox=gapLabel.geometricBounds;
                            gapLabel.translate((le+re)/2-(gapLabelBox[0]+gapLabelBox[2])/2,gy+tick+2-gapLabelBox[3]);
                            names.push('水平间隙 '+f(gapH));
                        }
                        group.name='AIQ 标注｜'+names.join(' / ');
                        count++;
                        if(a.linkToObjects)linkAnnotationGroup(group,[boxes[i].item,boxes[i].partnerItem]);
                        continue;
                    }
                    if(opt.autoFont){var objectBox=boxes[i].bounds,cx=(objectBox[0]+objectBox[2])/2,cy=(objectBox[1]+objectBox[3])/2,owner=d.artboards.getActiveArtboardIndex();for(var oi=0;oi<d.artboards.length;oi++){var ob=bounds(d.artboards[oi].artboardRect);if(cx>=ob[0]&&cx<=ob[2]&&cy>=ob[1]&&cy<=ob[3]){owner=oi;break;}}var obr=d.artboards[owner].artboardRect;fontSize=Math.max(4,Math.min(300,(obr[2]-obr[0])/40));}
                    var box=boxes[i].bounds,l=box[0],r=box[2],top=-box[1],bottom=-box[3],w=r-l,h=top-bottom,group=layer.groupItems.add();group.name='AIQ 标注｜尺寸 '+f(w)+' × '+f(h);var tick=3;
                    if(a.horizontal){var y=top+offset;line(group,[[l,top],[l,y+tick]]);line(group,[[r,top],[r,y+tick]]);line(group,[[l,y],[r,y]]);line(group,[[l-tick,y-tick],[l+tick,y+tick]]);line(group,[[r-tick,y-tick],[r+tick,y+tick]]);var label=text(group,f(w),l,y+fontSize+3);label.left=(l+r-label.width)/2;}
                    if(a.vertical){var x=r+offset;line(group,[[r,top],[x+tick,top]]);line(group,[[r,bottom],[x+tick,bottom]]);line(group,[[x,top],[x,bottom]]);line(group,[[x-tick,top-tick],[x+tick,top+tick]]);line(group,[[x-tick,bottom-tick],[x+tick,bottom+tick]]);text(group,f(h),x+4,(top+bottom+fontSize)/2);}
                    var labels=[];if(opt.area)labels.push('边界面积 '+(w*h/(scale*scale)).toFixed(decimals)+' '+unit+'²');if(opt.remark){if(typeof opt.remark!=='string'||opt.remark.length>500)throw Error('备注最多 500 字');labels.push('备注 '+opt.remark.replace(/[\r\n]+/g,' '));}if(opt.size)labels.push('尺寸 '+f(w)+' × '+f(h));if(opt.resolution)labels.push('栅格效果 '+dpi+' ppi');if(opt.bleed)labels.push('要求出血 '+f(bleed));if(opt.colors){labels=labels.concat(boxes[i].colors.labels);if(boxes[i].colors.unknown)labels.push('未解析颜色 '+boxes[i].colors.unknown+' 项');}
                    if(labels.length){var detail=text(group,labels.join('\r'),l,bottom-offset);if(opt.autoFont&&detail.width+fontSize*1.4>w){fontSize=Math.max(4,fontSize*w/(detail.width+fontSize*1.4));annotationFont(detail,fontSize);}if(opt.colors)annotationSwatches(d,group,detail,labels,boxes[i].colors,fontSize);}count++;
                    if(a.linkToObjects&&boxes[i].item)linkAnnotationGroup(group,[boxes[i].item]);
                }
            }
            app.redraw();geometryUndo=null;return resultEdit('已生成 '+count+' 组标注',['annotations']);
        }catch(error){if(d.layers.length>beforeLayers||count)return resultEdit('标注部分完成，已保留原对象；请检查并使用 Illustrator 撤销',['annotations'],[{objectId:'annotations',reason:String(error)}]);throw error;}
        finally{try{d.selection=originalSelection;}catch(restoreSelection){}}
    }

    // Group only adjacent siblings, so unrelated artwork keeps its stacking position.
    function annotationLinkItems(items){
        var parent=items[0].parent,p=parent,i,j,list=[],ordered=[],positions=[];
        while(p&&p.typename==='GroupItem'){if(p.clipped)throw Error('对象位于剪切蒙版内，无法关联标注');p=p.parent;}
        for(i=0;i<items.length;i++){
            if(items[i].parent!==parent)throw Error('关联标注要求对象位于同一容器');
            var li=limits(items[i]);if(li.locked||li.hidden)throw Error('锁定或隐藏对象无法关联标注');
        }
        for(i=0;i<parent.pageItems.length;i++)if(parent.pageItems[i].parent===parent)list.push(parent.pageItems[i]);
        for(i=0;i<list.length;i++)for(j=0;j<items.length;j++)if(list[i]===items[j]){ordered.push(list[i]);positions.push(i);break;}
        if(ordered.length!==items.length)throw Error('关联对象引用已失效');
        for(i=1;i<positions.length;i++)if(positions[i]!==positions[i-1]+1)throw Error('关联对象之间夹有其他对象，无法保持叠放顺序；请取消关联选项');
        return ordered;
    }
    function annotationChildren(group){var out=[];for(var i=0;i<group.pageItems.length;i++)if(group.pageItems[i].parent===group)out.push(group.pageItems[i]);return out;}
    function unwrapAnnotationGroup(group){
        // Never remove a container until every original child is safely outside it.
        var children=annotationChildren(group);
        for(var i=0;i<children.length;i++)children[i].move(group,ElementPlacement.PLACEBEFORE);
        if(annotationChildren(group).length)throw Error('关联群组仍有对象，已保留群组');
        group.remove();
    }
    function linkAnnotationGroup(annotationGroup,items){
        var ordered=annotationLinkItems(items),parent=ordered[0].parent,link=parent.groupItems.add();
        link.name='AIQ 关联群组';
        try{
            link.move(ordered[0],ElementPlacement.PLACEBEFORE);
            for(var i=0;i<ordered.length;i++)ordered[i].move(link,ElementPlacement.PLACEATEND);
            annotationGroup.move(link,ElementPlacement.PLACEATEND);
        }catch(linkError){
            // Roll back the moved prefix ahead of the original remaining siblings.
            // A failed rollback leaves the container and its contents intact.
            try{unwrapAnnotationGroup(link);}catch(restoreError){throw Error('关联未完成，已保留原对象与群组，请检查并撤销：'+restoreError.message);}
            throw Error('无法建立关联群组：'+linkError.message);
        }
        return link;
    }

    function annotateRemove(d,refs,a){
        if(!refs.length)throw Error('请选择已标注的对象或标注本身；空选区不会清除整层标注');
        var offset=Number(a&&a.annotation&&a.annotation.offset),pad,removed=0,changed=false,i,k;
        if(!isFinite(offset)||Math.abs(offset)>10000)throw Error('标注距离须在 ±10000 pt 内');
        pad=Math.abs(offset)+40;
        function isAnnotation(item){return item.typename==='GroupItem'&&/^AIQ 标注[｜|]/.test(String(item.name));}
        function isLink(item){return item&&item.typename==='GroupItem'&&String(item.name)==='AIQ 关联群组';}
        function pushUnique(list,item){for(var j=0;j<list.length;j++)if(list[j]===item)return;list.push(item);}
        function near(sub,target){var b1=editorBounds(sub),b2=editorBounds(target);return b1[0]-pad<=b2[2]&&b1[2]+pad>=b2[0]&&b1[1]-pad<=b2[3]&&b1[3]+pad>=b2[1];}
        var links=[],targets=[],labels=[];
        for(i=0;i<refs.length;i++){
            var item=refs[i].item,container=isLink(item)?item:(isLink(item.parent)?item.parent:null);
            if(container){pushUnique(links,container);continue;}
            if(isAnnotation(item)){pushUnique(labels,item);continue;}
            targets.push(item);
        }
        // Unlinked labels live on their own layer, not in the source object's parent.
        // Associated labels belong only to their own link, never a nearby object.
        for(i=0;i<d.groupItems.length;i++){
            var sub=d.groupItems[i];if(!isAnnotation(sub)||isLink(sub.parent))continue;
            for(k=0;k<targets.length;k++)if(near(sub,targets[k])){pushUnique(labels,sub);break;}
        }
        for(i=0;i<links.length;i++){
            var link=links[i],lim=limits(link);
            if(lim.locked||lim.hidden||link.clipped||link.opacity!==100||link.blendingMode!==BlendModes.NORMAL)throw Error('关联群组已锁定、隐藏或带整体外观，请先恢复后取消标注');
            var children=annotationChildren(link);
            for(k=0;k<children.length;k++){
                var childLimit=limits(children[k]);if(childLimit.locked||childLimit.hidden)throw Error('关联群组内有锁定或隐藏对象，无法安全还原');
                if(isAnnotation(children[k]))pushUnique(labels,children[k]);
            }
        }
        for(i=0;i<labels.length;i++){var labelLimit=limits(labels[i]);if(labelLimit.locked||labelLimit.hidden)throw Error('标注已锁定或隐藏，请先恢复后删除');}
        if(!labels.length)throw Error('所选对象附近没有找到可取消的 AIQ 标注');
        try{
            for(i=0;i<labels.length;i++){labels[i].remove();removed++;changed=true;}
            for(i=0;i<links.length;i++){
                // User edits to a link's appearance must never be erased by flattening.
                changed=true;unwrapAnnotationGroup(links[i]);
            }
            geometryUndo=null;app.redraw();return resultEdit('已删除 '+removed+' 组标注',['annotations']);
        }catch(error){
            if(changed)return resultEdit('取消标注部分完成，所有未移出的原对象仍保留，请检查并撤销',['annotations'],[{objectId:'annotations',reason:String(error)}]);
            throw error;
        }
    }

    // 曲线长度：三次贝塞尔自适应细分累计；区间按 1 起始锚点编号，闭合路径可环绕。
    function pathLengthMeasure(d,refs,cache,a){
        if(refs.length!==1)throw Error('请选择一条路径或复合路径计算长度');
        var item=refs[0].item,paths=[],i;
        if(item.typename==='PathItem')paths.push(item);
        else if(item.typename==='CompoundPathItem'){for(i=0;i<item.pathItems.length;i++)paths.push(item.pathItems[i]);}
        else throw Error('请选择路径或复合路径；文字和群组请先转曲或解组');
        var unit=documentUnit(d),scale=unitScale(unit),opt=a.annotation||{},decimals=annotationPrecision(opt);
        if(unit!==cache.unit)throw Error('文档单位已改变，请重新读取');
        var wantRange=a.from!==undefined||a.to!==undefined;
        var fi=a.from===undefined?1:Number(a.from),ti=a.to===undefined?0:Number(a.to);
        if(wantRange&&paths.length!==1)throw Error('区间测量仅支持单一路径，请单独选择目标子路径');
        if(wantRange&&(!isFinite(fi)||!isFinite(ti)||fi%1||ti%1||fi<1||ti<1))throw Error('锚点编号从 1 开始的正整数');
        var measured=0,rangeMid=null,lines=[],visits=0;
        function distance(a,b){var x=a[0]-b[0],y=a[1]-b[1];return Math.sqrt(x*x+y*y);}
        function midpoint(a,b){return [(a[0]+b[0])/2,(a[1]+b[1])/2];}
        // Bound accumulated chord error by the control polygon excess (0.01 pt
        // over the measured paths). Fail explicitly if subdivision exceeds budget.
        function flatten(p0,p1,p2,p3,tolerance,depth){
            if(++visits>100000)throw Error('曲线过于复杂，超出本次测量预算');
            var chord=distance(p0,p3),net=distance(p0,p1)+distance(p1,p2)+distance(p2,p3);
            if(net-chord<=tolerance){lines.push({from:p0,to:p3,length:chord});measured+=chord;return;}
            if(depth>=20)throw Error('曲线细分未达到精度要求，请缩小测量范围');
            var a=midpoint(p0,p1),b=midpoint(p1,p2),c=midpoint(p2,p3),d=midpoint(a,b),e=midpoint(b,c),m=midpoint(d,e);
            flatten(p0,a,d,m,tolerance/2,depth+1);flatten(m,e,c,p3,tolerance/2,depth+1);
        }
        for(i=0;i<paths.length;i++){
            var pts=paths[i].pathPoints,n=pts.length,j,sequence=[];
            if(n<2)continue;
            var closed=paths[i].closed,segCount=closed?n:n-1;
            if(wantRange){
                if(fi>n||ti>n)throw Error('锚点编号最多为 '+n);
                if(!closed&&fi>=ti)throw Error('开放路径需要起点小于终点（1–'+n+'）');
                if(closed&&fi===ti)throw Error('区间起点与终点相同');
                var cursor=fi-1;
                while(cursor!==ti-1){sequence.push(cursor);cursor=(cursor+1)%n;if(sequence.length>segCount)throw Error('锚点区间无效');}
            }else{for(j=0;j<segCount;j++)sequence.push(j);}
            for(j=0;j<sequence.length;j++){
                var start=sequence[j],next=closed?(start+1)%n:start+1;
                flatten(pts[start].anchor,pts[start].rightDirection,pts[next].leftDirection,pts[next].anchor,0.01/(paths.length*sequence.length),0);
            }
        }
        if(!(measured>0))throw Error('无法计算该路径长度，请检查路径是否有效');
        var walked=0;
        for(i=0;i<lines.length;i++){
            var segment=lines[i];
            if(segment.length>0&&walked+segment.length>=measured/2){
                var ratio=(measured/2-walked)/segment.length;
                rangeMid=[segment.from[0]+(segment.to[0]-segment.from[0])*ratio,-(segment.from[1]+(segment.to[1]-segment.from[1])*ratio)];break;
            }
            walked+=segment.length;
        }
        var label='曲线长度 '+(measured/scale).toFixed(decimals)+' '+unit;
        if(a.label){
            var labelSize=Number(a.fontSize);if(!isFinite(labelSize)||labelSize<4||labelSize>300)throw Error('标注字号须为 4–300 pt');annotationInk(opt);if(a.linkToObjects)annotationLinkItems([item]);
            if(!rangeMid){var gb=editorBounds(item);rangeMid=[(gb[0]+gb[2])/2,(gb[1]+gb[3])/2];}
            var beforeLayers=d.layers.length,originalSelection=d.selection;
            try{
                var layer=d.layers.add();layer.name='AIQ 对象尺寸标注';
                var ink=annotationInk(opt),group=layer.groupItems.add(),t=group.textFrames.add();
                t.contents=label;annotationFont(t,labelSize);t.textRange.characterAttributes.fillColor=ink;
                try{t.textRange.characterAttributes.textFont=app.textFonts.getByName('MicrosoftYaHei');}catch(noFont){}
                t.position=[rangeMid[0],-rangeMid[1]];group.name='AIQ 标注｜'+label;
                if(a.linkToObjects)linkAnnotationGroup(group,[item]);
                geometryUndo=null;app.redraw();
                var measuredResult=resultEdit('已生成曲线长度标注：'+(measured/scale).toFixed(decimals)+' '+unit,['annotations']);measuredResult.pathLength=measured;return measuredResult;
            }catch(error){if(d.layers.length>beforeLayers)return resultEdit('曲线标注部分完成，已保留原对象；请检查并撤销',['annotations'],[{objectId:'annotations',reason:String(error)}]);throw error;}
            finally{try{d.selection=originalSelection;}catch(restoreSelection){}}
        }
        var r=resultEdit('曲线长度 '+(measured/scale).toFixed(decimals)+' '+unit+(wantRange?'（锚点 '+fi+' → '+ti+'）':'（整条）'));
        r.pathLength=measured;return r;
    }

function deliveryAction(event,params){
 function hex(s){return encodeURIComponent(s).replace(/%([0-9a-f]{2})|([^%])/gi,function(_,a,b){return a?a:('0'+b.charCodeAt(0).toString(16)).slice(-2);});}
 function str(s){var h=hex(s);return '[ '+h.length/2+'\n'+h+'\n]';}
 var set='AIQ_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000),file=new File(Folder.temp+'/'+set+'.aia');
 var actionLabel='Save A Copy';if(event==='adobe_exportDocument')actionLabel='Export As';else if(event==='ai_plugin_alignPalette')actionLabel='Distribute Spacing';
 var body='/version 3\n/name '+str(set)+'\n/isOpen 0\n/actionCount 1\n/action-1 {\n/name '+str('Run')+'\n/keyIndex 0\n/colorIndex 0\n/isOpen 0\n/eventCount 1\n/event-1 {\n/useRulersIn1stQuadrant 0\n/internalName ('+event+')\n/localizedName '+str(actionLabel)+'\n/isOpen 0\n/isOn 1\n/hasDialog '+(event==='ai_plugin_alignPalette'?0:1)+'\n/showDialog 0\n/parameterCount '+params.length+'\n';
 for(var i=0;i<params.length;i++){var p=params[i];body+='/parameter-'+(i+1)+' {\n/key '+p[0]+'\n/showInPalette '+(p[1]==='raw'?0:4294967295)+'\n/type ('+p[1]+')\n'+(p[1]==='enumerated'?'/name '+str('Distribute Spacing')+'\n':'')+(p[1]==='raw'?' /value < '+p[2].length/2+'\n'+p[2].match(/.{1,64}/g).join('\n')+'\n>\n/size '+p[2].length/2:' /value '+(p[1]==='ustring'?str(p[2]):p[2]))+'\n}\n';}
 body+='}\n}\n';
 if(!file.open('w'))throw Error('Cannot write action');file.write(body);file.close();var loaded=false;
 try{app.loadAction(file);loaded=true;app.doScript('Run',set,false);}finally{if(loaded)try{app.unloadAction(set,'');}catch(ignore){}file.remove();}
}

    // Parse at most 16 MiB. Never modify or remove the input file.
    var lastBleedReadMethod='';
    // Native reply is a small numeric IPC record, never a document snapshot.
    function nativeSelectedArtboards(d){
        var nonce='',i;for(i=0;i<32;i++)nonce+=Math.floor(Math.random()*16).toString(16);
        var reply=new File(Folder.temp.fsName+'/AIQNative-'+nonce+'.json');if(reply.exists)throw Error('画板读取请求冲突');
        try{app.sendScriptMessage('AIQNative','boards-file:'+nonce,'');
            if(!reply.exists||reply.length>20000||!reply.open('r'))throw Error('原生多选画板模块不可用，请完整安装后重启');
            var data=parseJSON(reply.read());reply.close();
            if(!data||data.ok!==true||data.protocol!==1||data.count!==d.artboards.length||data.active!==d.artboards.getActiveArtboardIndex()||!(data.selected instanceof Array))throw Error('原生画板选区读取失败');
            var seen={};for(i=0;i<data.selected.length;i++){var n=data.selected[i];if(typeof n!=='number'||n%1||n<0||n>=data.count||seen[n])throw Error('画板选区数据无效');seen[n]=true;}
            return data.selected;
        }finally{try{reply.close();}catch(ignore){}if(reply.exists)reply.remove();}
    }
    function setDocumentBleed(d,a){
        if(!(a.offsets instanceof Array)||a.offsets.length!==4)throw Error('四边出血无效');
        var values=[],i;for(i=0;i<4;i++){var n=a.offsets[i];if(typeof n!=='number'||!isFinite(n)||n<0||n>72)throw Error('每边出血须在 0–72 pt 内');values.push(n.toFixed(8));}
        var before=documentBleed(d),same=true;for(i=0;i<4;i++)if(Math.abs(before[i]-a.offsets[i])>0.00001)same=false;
        if(same){var unchanged=resultEdit('出血已是当前数值');unchanged.bleedOffsets=before;return unchanged;}
        var nonce='';for(i=0;i<32;i++)nonce+=Math.floor(Math.random()*16).toString(16);
        var reply=new File(Folder.temp.fsName+'/AIQNative-'+nonce+'.json');if(reply.exists)throw Error('出血请求冲突，请重试');
        try{
            geometryUndo=null;
            app.sendScriptMessage('AIQNative','bleed-set:'+nonce+':'+values.join(','),'');
            if(!reply.exists||reply.length>2048||!reply.open('r'))throw Error('原生模块尚不支持设置出血，请在正常重启 Illustrator 后重试');
            var raw=reply.read();reply.close();var data=parseJSON(raw);
            if(!data||data.ok!==true||data.protocol!==1||data.unit!=='pt'||!(data.offsets instanceof Array)||data.offsets.length!==4)throw Error('原生出血设置未确认，请检查文档设置');
            for(i=0;i<4;i++)if(typeof data.offsets[i]!=='number'||!isFinite(data.offsets[i])||Math.abs(data.offsets[i]-a.offsets[i])>0.00001)throw Error('出血回读与目标不符，请检查文档设置');
            geometryUndo=null;app.redraw();var done=resultEdit('已设置文档四边出血',['document-bleed']);done.bleedOffsets=data.offsets;return done;
        }catch(writeError){
            var uncertain=resultEdit('出血设置未能确认，请检查文档出血后重试',['document-bleed'],[{objectId:'document-bleed',reason:String(writeError)}]);
            try{uncertain.bleedOffsets=documentBleed(d);}catch(readError){}
            return uncertain;
        }finally{try{reply.close();}catch(closeError){}if(reply.exists)reply.remove();}
    }
    function nativeDocumentBleed(){
        var nonce='',i;for(i=0;i<32;i++)nonce+=Math.floor(Math.random()*16).toString(16);
        var reply=new File(Folder.temp.fsName+'/AIQNative-'+nonce+'.json');
        if(reply.exists)throw Error('出血读取请求冲突，请重试');
        try{
            app.sendScriptMessage('AIQNative','bleed-file:'+nonce,'');
            if(!reply.exists||reply.length>2048||!reply.open('r'))throw Error('原生出血模块未返回有效数据');
            var raw=reply.read();reply.close();var data=parseJSON(raw);
            if(!data||data.ok!==true||data.protocol!==1||data.unit!=='pt'||!(data.offsets instanceof Array)||data.offsets.length!==4)throw Error('原生出血读取失败');
            for(i=0;i<4;i++)if(typeof data.offsets[i]!=='number'||!isFinite(data.offsets[i])||data.offsets[i]<0||data.offsets[i]>720)throw Error('原生出血数据超出支持范围');
            return data.offsets;
        }finally{try{reply.close();}catch(closeError){}if(reply.exists)reply.remove();}
    }
    // Source settings only: no file parsing, saves, copies, or view changes.
    function documentBleed(d){lastBleedReadMethod='native';try{return nativeDocumentBleed();}catch(e){throw Error('原生出血模块不可用，请完整安装后重启 Illustrator；不会保存或创建副本。');}}
    // Illustrator 30 uses a 104-byte JPEG parameter record (older releases used 100).
    function cmykJPEG(copy,out,dpi,quality,index,colorModel){
        var data=[],i;for(i=0;i<104;i++)data[i]=0;
        function put(at,n){for(var k=0;k<4;k++){data[at+k]=n%256;n=Math.floor(n/256);}}
        put(0,Math.round(quality/10));put(4,1);put(8,3);put(12,2);put(16,Math.round(dpi*65536));put(20,colorModel===1?1:2);put(24,0);put(28,1);put(96,65536);
        for(i=0;i<8;i++)data[32+i*2]='imagemap'.charCodeAt(i);
        var raw='';for(i=0;i<104;i++)raw+=('0'+data[i].toString(16)).slice(-2);
        var folder=new Folder(Folder.temp+'/AIQ_jpeg_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000));if(!folder.create())throw Error('无法创建 JPEG 临时目录');
        var target=new File(folder.fullName+'/image.jpg'),page=new File(folder.fullName+'/image-01.jpg');
        try{deliveryAction('adobe_exportDocument',[[1885434477,'raw',raw],[1851878757,'ustring',target.fsName],[1718775156,'ustring','JPEG file format'],[1702392942,'ustring','jpg,jpe,jpeg'],[1936548194,'boolean',1],[1935764588,'boolean',0],[1936875886,'ustring',String((index===undefined?0:index)+1)]]);
            var n=0,generated=folder.getFiles('image*.jpg');while(!generated.length&&n++<12){$.sleep(250);generated=folder.getFiles('image*.jpg');}
            var actual=generated.length===1?generated[0]:target;if(generated.length!==1||!actual.exists||!actual.length||out.exists||!actual.copy(out.fsName))throw Error('CMYK JPEG 输出失败');
        }finally{var owned=folder.getFiles('image*.jpg');for(var cleanup=0;cleanup<owned.length;cleanup++)if(owned[cleanup] instanceof File)owned[cleanup].remove();folder.remove();}
    }


    function validateDeliveryOptions(a,color){
        var percent=a.scale===undefined?100:a.scale;
        if(typeof percent!=='number'||!isFinite(percent)||percent<1||percent>10000)throw Error('缩放须为 1–10000%，1000% 为 10 倍，10000% 为 100 倍');
        if(a.overprintBlack&&(!/^(pdf|ai|eps)$/.test(a.format)||color!=='cmyk'))throw Error('纯黑叠印仅适用于 CMYK 的 PDF、AI、EPS');
        if(a.outlineText&&!/^(pdf|ai|eps|svg)$/.test(a.format))throw Error('文字转曲仅适用于矢量格式');
        if(a.antiAliasing===false)throw Error('当前 Illustrator 导出接口未可靠关闭抗锯齿，使用原生默认光滑处理');
        var n=a.naming;if(!n||!n.enabled)return;
        if(!(n.blocks instanceof Array)||!n.blocks.length||n.blocks.length>6||!/^(document-artboard|artboard|custom)$/.test(n.nameSource))throw Error('命名块设置无效');
        unitScale(n.unit);if(typeof n.decimals!=='number'||n.decimals%1||n.decimals<0||n.decimals>6)throw Error('尺寸小数位须为 0–6');
        var kinds={},any=false;for(var i=0;i<n.blocks.length;i++){var b=n.blocks[i];if(!/^(remark|material|size|name|customer|bleed)$/.test(b.kind)||kinds[b.kind]||typeof b.value!=='string'||b.value.length>100)throw Error('命名块类型重复或内容过长');kinds[b.kind]=true;if(b.enabled)any=true;}
        if(!any)throw Error('请至少启用一个命名块');
    }
    function deliveryName(a,docName,boardName,width,height,bleedSides){
        var n=a.naming,parts=[],ratio=(a.scale===undefined?100:a.scale)/100,factor=unitScale(n.unit),i;
        function number(v){return (v*ratio/factor).toFixed(n.decimals);}
        for(i=0;i<n.blocks.length;i++){var b=n.blocks[i],v='';if(!b.enabled)continue;
            if(b.kind==='size'){v=number(width)+'x'+number(height)+n.unit;}
            else if(b.kind==='name'){if(n.nameSource==='artboard')v=boardName;else if(n.nameSource==='custom')v=b.value;else v=(a.fileName||docName)+'-'+boardName;}
            else if(b.kind==='bleed'){if(a.useDocumentBleed&&a.target==='artboards')v='出血L'+number(bleedSides[0])+'T'+number(bleedSides[1])+'R'+number(bleedSides[2])+'B'+number(bleedSides[3])+n.unit;}
            else v=b.value;
            v=String(v).replace(/^\s+|\s+$/g,'');if(v)parts.push(v);
        }
        if(!parts.length)throw Error('启用的命名块内容为空');var name=parts.join('-');if(name.length>150)throw Error('组合文件名超过 150 字符，请缩短命名块');return name;
    }
    // One native operation on the owned copy; never outline individual frames or merge paths.
    function outlineDeliveryText(copy){
        var frames=[],flags=[],i,j,threaded=false;
        for(i=0;i<copy.textFrames.length;i++){var frame=copy.textFrames[i];if(!limits(frame).hidden)frames.push(frame);}
        if(!frames.length)return;
        for(i=0;i<frames.length;i++){var linked=frames[i].story.textFrames;if(linked.length>1)threaded=true;if(linked.length>1)for(j=0;j<linked.length;j++)if(limits(linked[j]).hidden)throw Error('串接故事包含隐藏文字框，无法仅转曲可见部分；请先检查该故事');}
        try{
            for(i=0;i<frames.length;i++){
                var parent=frames[i];
                while(parent&&parent.typename!=='Document'){
                    if(parent.locked){flags.push(parent);parent.locked=false;}
                    parent=parent.parent;
                }
            }
            copy.activate();copy.selection=null;if(threaded){for(i=0;i<frames.length;i++)frames[i].selected=true;}else copy.selection=frames;
            // Illustrator can expose selected text through grouped selection entries.
            // Validate each requested frame, not the number of top-level entries.
            for(i=0;i<frames.length;i++)if(!frames[i].selected)throw Error('无法完整选中副本中的可见文字');
            app.executeMenuCommand('outline');
            for(j=0;j<copy.textFrames.length;j++)if(!limits(copy.textFrames[j]).hidden)throw Error('原生批量转曲后仍有可见文字，未输出该文件');
        }finally{copy.selection=null;for(i=flags.length-1;i>=0;i--)try{flags[i].locked=true;}catch(removed){}}
    }
    function prepareDelivery(copy,a,dpi){
        var ratio=(a.scale===undefined?100:a.scale)/100,boards=[],i,j,r,left=Infinity,top=-Infinity,right=-Infinity,bottom=Infinity;
        for(i=0;i<copy.artboards.length;i++){r=copy.artboards[i].artboardRect;boards.push([r[0],r[1],r[2],r[3]]);positive((r[2]-r[0])*ratio);positive((r[1]-r[3])*ratio);left=Math.min(left,r[0]);top=Math.max(top,r[1]);right=Math.max(right,r[2]);bottom=Math.min(bottom,r[3]);
            if(/^(png|jpeg|tif|psd)$/.test(a.format)){var pw=Math.ceil((r[2]-r[0])*ratio*dpi/72),ph=Math.ceil((r[1]-r[3])*ratio*dpi/72);checkRasterPixels(pw,ph);}}
        if(ratio===1&&!a.outlineText&&!a.overprintBlack)return;
        if(ratio===1&&!a.overprintBlack){outlineDeliveryText(copy);return;}
        if((right-left)*ratio>16348||(top-bottom)*ratio>16348)throw Error('缩放后画板排布超出普通画布范围，请分开导出');
        if(copy.pageItems.length>5000)throw Error('导出处理超过 5000 个对象，请分批导出');
        var ox=(left+right)/2,oy=(top+bottom)/2,flags=[],roots=[],items=[];
        // Only unlock the owned delivery copy. Original layers and selection are never touched.
        function unlockLayer(layer){flags.push({item:layer,locked:layer.locked,visible:layer.visible});layer.locked=false;layer.visible=true;for(var k=0;k<layer.layers.length;k++)unlockLayer(layer.layers[k]);}
        function unlockItem(item){flags.push({item:item,locked:item.locked,hidden:item.hidden});item.locked=false;item.hidden=false;items.push(item);if(item.typename==='GroupItem'){for(var k=0;k<item.pageItems.length;k++)if(item.pageItems[k].parent===item)unlockItem(item.pageItems[k]);}}
        try{
            for(i=0;i<copy.layers.length;i++)unlockLayer(copy.layers[i]);
            for(i=0;i<copy.pageItems.length;i++)if(copy.pageItems[i].parent.typename==='Layer')roots.push(copy.pageItems[i]);
            for(i=0;i<roots.length;i++)unlockItem(roots[i]);
            if(items.length>5000)throw Error('导出处理超过 5000 个对象，请分批导出');
            if(ratio!==1){for(i=0;i<roots.length;i++){var item=roots[i],old=item.geometricBounds,x=(old[0]-ox)*ratio,y=(old[1]-oy)*ratio;item.resize(ratio*100,ratio*100,true,true,true,true,ratio*100,Transformation.CENTER);var now=item.geometricBounds;item.translate(x-now[0],y-now[1]);}
                for(i=0;i<boards.length;i++){r=boards[i];copy.artboards[i].artboardRect=[(r[0]-ox)*ratio,(r[1]-oy)*ratio,(r[2]-ox)*ratio,(r[3]-oy)*ratio];}}
            for(i=flags.length-1;i>=0;i--){if(flags[i].visible!==undefined)flags[i].item.visible=flags[i].visible;if(flags[i].hidden!==undefined)flags[i].item.hidden=flags[i].hidden;}
            function black(c){return c&&c.typename==='CMYKColor'&&c.cyan===0&&c.magenta===0&&c.yellow===0&&c.black===100;}
            if(a.overprintBlack){for(i=0;i<copy.pathItems.length;i++){var p=copy.pathItems[i];if(!limits(p).hidden&&!p.clipping){if(p.filled&&black(p.fillColor))p.fillOverprint=true;if(p.stroked&&black(p.strokeColor))p.strokeOverprint=true;}}
                var chars=0;for(i=0;i<copy.textFrames.length;i++){var text=copy.textFrames[i];if(limits(text).hidden)continue;chars+=text.characters.length;if(chars>50000)throw Error('纯黑叠印超过 50000 字，请分批导出');for(j=0;j<text.characters.length;j++){var ca=text.characters[j].characterAttributes;if(black(ca.fillColor))ca.overprintFill=true;if(black(ca.strokeColor))ca.overprintStroke=true;}}}
            if(a.outlineText)outlineDeliveryText(copy);
        }finally{for(i=flags.length-1;i>=0;i--){try{if(flags[i].visible!==undefined)flags[i].item.visible=flags[i].visible;if(flags[i].hidden!==undefined)flags[i].item.hidden=flags[i].hidden;flags[i].item.locked=flags[i].locked;}catch(removed){}}}
    }


    // Stream only the owned output through a sibling temporary file; never decode pixel data.
    function deliveryMetadata(out,format,dpi,rect){
        if(!/^(png|jpeg|svg)$/.test(format))return;
        var tmp=new File(out.parent.fullName+'/AIQ_meta_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000)+'.tmp'),ok=false;
        function be(n,len){var v='';for(var i=0;i<len;i++){v=String.fromCharCode(n%256)+v;n=Math.floor(n/256);}return v;}
        function read32(s,at){return s.charCodeAt(at)*16777216+s.charCodeAt(at+1)*65536+s.charCodeAt(at+2)*256+s.charCodeAt(at+3);}
        function crc(s){var c=-1;for(var i=0;i<s.length;i++){c^=s.charCodeAt(i);for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^-1)>>>0;}
        function write(s){if(!tmp.write(s))throw Error('无法写入导出尺寸信息');}
        try{out.encoding='BINARY';tmp.encoding='BINARY';if(!out.open('r')||!tmp.open('w'))throw Error('无法读取导出文件以记录尺寸');
            if(format==='png'){
                var head=out.read(33);if(head.substr(1,3)!=='PNG'||head.substr(12,4)!=='IHDR')throw Error('PNG 文件头无效');write(head);
                var physical='pHYs'+be(Math.round(dpi/0.0254),4)+be(Math.round(dpi/0.0254),4)+'\x01';write(be(9,4)+physical+be(crc(physical),4));
                // Preserve all chunks except a superseded pHYs record.
                while(!out.eof){var ch=out.read(8);if(ch.length<8)throw Error('PNG 数据不完整');var count=read32(ch,0)+4;if(ch.substr(4,4)==='pHYs'){out.seek(count,1);continue;}write(ch);while(count>0){var part=out.read(Math.min(count,65536));if(!part.length)throw Error('PNG 数据不完整');write(part);count-=part.length;}}
            }else if(format==='jpeg'){
                if(out.read(2)!=='\xff\xd8')throw Error('JPEG 文件头无效');write('\xff\xd8');
                var jfif='JFIF\x00\x01\x02\x01'+be(Math.round(dpi),2)+be(Math.round(dpi),2)+'\x00\x00';write('\xff\xe0'+be(jfif.length+2,2)+jfif);
                var resolution=be(Math.round(dpi*65536),4)+'\x00\x01\x00\x01'+be(Math.round(dpi*65536),4)+'\x00\x01\x00\x01';
                while(!out.eof){var tag=out.read(2);if(tag.length!==2||tag.charCodeAt(0)!==255)throw Error('JPEG 标记无效');if(tag==='\xff\xda'){write(tag);break;}var sizeBytes=out.read(2),size=sizeBytes.charCodeAt(0)*256+sizeBytes.charCodeAt(1),body=out.read(size-2);if(size<2||body.length!==size-2)throw Error('JPEG 数据不完整');
                    if(tag==='\xff\xe0'&&body.substr(0,5)==='JFIF\x00')continue;
                    if(tag==='\xff\xed'){var pos=body.indexOf('8BIM\x03\xed');if(pos>=0){var nameLength=body.charCodeAt(pos+6)+1;if(nameLength%2)nameLength++;var dataPos=pos+6+nameLength+4;if(read32(body,dataPos-4)===16)body=body.substr(0,dataPos)+resolution+body.substr(dataPos+16);}}
                    write(tag+sizeBytes+body);
                }
                while(!out.eof)write(out.read(65536));
            }else{
                var prefix=out.read(16384),match=/<svg\b[^>]*>/.exec(prefix);if(!match)throw Error('SVG 文件头无效');var root=match[0].replace(/\s(?:width|height)="[^"]*"/g,'');root=root.replace('<svg','<svg width="'+(rect[2]-rect[0])+'pt" height="'+(rect[1]-rect[3])+'pt"');write(prefix.replace(match[0],root));while(!out.eof)write(out.read(65536));
            }
            out.close();tmp.close();if(!tmp.length||!out.remove()||!tmp.rename(decodeURI(out.name)))throw Error('无法完成导出尺寸信息写入');ok=true;
        }finally{try{out.close();tmp.close();}catch(ignore){}if(!ok&&tmp.exists)tmp.remove();}
    }

    function deliveryEmbeddedICC(file,kind){
        function read(at,n){if(at<0||n<0||n>16000000||at+n>file.length)throw Error('ICC 数据范围无效');file.seek(at);var s=file.read(n);if(s.length!==n)throw Error('ICC 数据不完整');return s;}
        function be(s,p,n){var v=0;for(var i=0;i<n;i++)v=v*256+s.charCodeAt(p+i);return v;}
        file.encoding='BINARY';if(!file.open('r'))throw Error('无法读取导出 ICC');
        try{
            if(kind==='psd'){
                var head=read(0,30);if(head.substr(0,4)!=='8BPS'||be(head,4,2)!==1)throw Error('PSD 文件头无效');
                var at=30+be(head,26,4),length=be(read(at,4),0,4),end=at+4+length;at+=4;
                while(at+12<=end){var item=read(at,7);if(item.substr(0,4)!=='8BIM')throw Error('PSD 资源无效');var id=be(item,4,2),name=1+item.charCodeAt(6);at+=6+name+(name%2);var size=be(read(at,4),0,4);at+=4;if(at+size>end)throw Error('PSD ICC 越界');if(id===1039)return read(at,size);at+=size+(size%2);}
            }else{
                var h=read(0,8),little=h.substr(0,2)==='II';if(!little&&h.substr(0,2)!=='MM')throw Error('TIF 文件头无效');
                function number(s,p,n){if(!little)return be(s,p,n);var v=0;for(var i=n-1;i>=0;i--)v=v*256+s.charCodeAt(p+i);return v;}
                if(number(h,2,2)!==42)throw Error('TIF 类型尚未支持');var offset=number(h,4,4),count=number(read(offset,2),0,2);if(count>4096)throw Error('TIF 元数据过多');
                for(var k=0;k<count;k++){var tag=read(offset+2+k*12,12);if(number(tag,0,2)===34675){var len=number(tag,4,4);if(number(tag,2,2)!==7||len<128)throw Error('TIF ICC 标签无效');return read(number(tag,8,4),len);}}
            }
            throw Error('导出未包含 ICC，已停止交付');
        }finally{file.close();}
    }
    function saveLayeredTiff(psd,out,dpi){
        if(typeof BridgeTalk==='undefined'||!BridgeTalk.getSpecifier('photoshop'))throw Error('原生 TIF 保留 ICC 需要 Photoshop；也可改用独立渲染');
        var bt=new BridgeTalk(),reply=null,failed=false;bt.target=BridgeTalk.getSpecifier('photoshop');
        var input=psd.fsName.replace(/\\/g,'/'),output=out.fsName.replace(/\\/g,'/');
        bt.body='(function(){var d=null,previous=app.documents.length?app.activeDocument:null,dialogs=app.displayDialogs;try{app.displayDialogs=DialogModes.NO;var input=new File('+quote(input)+'),output=new File('+quote(output)+');if(!input.exists||output.exists)throw Error("Invalid owned output");d=app.open(input);if(Math.abs(d.resolution-'+dpi+')>.03)throw Error("Resolution mismatch");var w=d.width.as("px"),h=d.height.as("px"),count=d.layers.length,profile=d.colorProfileName;var o=new TiffSaveOptions();o.layers=true;o.embedColorProfile=true;o.imageCompression=TIFFEncoding.TIFFLZW;o.layerCompression=LayerCompression.ZIP;o.transparency=true;d.saveAs(output,o,true,Extension.LOWERCASE);d.close(SaveOptions.DONOTSAVECHANGES);d=null;d=app.open(output);if(d.width.as("px")!==w||d.height.as("px")!==h||Math.abs(d.resolution-'+dpi+')>.03||d.layers.length!==count||d.colorProfileName!==profile)throw Error("Layered TIFF verification failed");return "AIQ_TIFF_OK";}finally{if(d)d.close(SaveOptions.DONOTSAVECHANGES);if(previous)app.activeDocument=previous;app.displayDialogs=dialogs;}})()';
        bt.onResult=function(m){reply=String(m.body);};bt.onError=function(){failed=true;};bt.send(120);
        if(reply!=='AIQ_TIFF_OK'){var error=Error(failed?'Photoshop 分层 TIF 保存／核验失败':'Photoshop 尚未确认分层 TIF 完成；暂存文件保留，请勿重复发送');error.aiqPendingPhotoshop=!failed;throw error;}
        if(deliveryEmbeddedICC(psd,'psd')!==deliveryEmbeddedICC(out,'tif'))throw Error('Photoshop 改变了稿件 ICC，已停止交付；请将 PS 颜色策略设置为保留嵌入配置');
    }
    function saveDeliveryRaster(copy,out,a,dpi,index){
        // Illustrator 30's native TIFF writer drops the ICC tag even when the
        // unsupported embedICCProfile property is set. Route through an embedded
        // native PSD; Photoshop preserves that profile without changing mode.
        var layeredTiff=a.format==='tif';
        var rasterFormat=layeredTiff?'psd':a.format;
        var o=rasterFormat==='tif'?new ExportOptionsTIFF():new ExportOptionsPhotoshop();
        var cmyk=false;
        if(a.colorMode==='cmyk')cmyk=true;
        else if(a.colorMode!=='rgb'){if(String(copy.documentColorSpace)==='DocumentColorSpace.CMYK')cmyk=true;}
        o.resolution=dpi;o.imageColorSpace=cmyk?ImageColorSpace.CMYK:ImageColorSpace.RGB;
        o.embedICCProfile=true;o.saveMultipleArtboards=true;o.artboardRange=String((index===undefined?0:index)+1);
        if(rasterFormat==='tif'){o.lZWCompression=true;o.antiAliasing=AntiAliasingMethod.ARTOPTIMIZED;}
        else{var keepLayers=a.format==='psd'?a.writeLayers!==false:a.writeLayers===true;o.antiAliasing=true;o.writeLayers=keepLayers;o.editableText=keepLayers;o.maximumEditability=keepLayers;o.warnings=false;}
        var dir=new Folder(Folder.temp+'/AIQ_raster_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000)),retainPending=false;
        if(!dir.create())throw Error('无法创建栅格临时目录');
        try{
            copy.exportFile(new File(dir.fullName+'/page.'+rasterFormat),rasterFormat==='tif'?ExportType.TIFF:ExportType.PHOTOSHOP,o);
            var attempts=0,found=dir.getFiles('*.'+rasterFormat);
            while((found.length!==1||!found[0].length)&&attempts++<12){$.sleep(250);found=dir.getFiles('*.'+rasterFormat);}
            if(found.length!==1||!found[0].length||out.exists)throw Error('未生成唯一有效 '+a.format.toUpperCase()+' 文件');
            if(layeredTiff){var staged=new File(dir.fullName+'/verified.tif');saveLayeredTiff(found[0],staged,dpi);if(out.exists||!staged.exists||!staged.length||!staged.copy(out.fsName))throw Error('无法写入已验证的分层 TIF');}
            else if(!found[0].copy(out.fsName))throw Error('无法写入 '+a.format.toUpperCase()+' 文件');
        }catch(rasterError){retainPending=rasterError.aiqPendingPhotoshop===true;throw rasterError;}
        finally{if(!retainPending){var owned=dir.getFiles();for(var k=0;k<owned.length;k++)if(owned[k] instanceof File)owned[k].remove();dir.remove();}}
    }
    function saveDelivery(copy,out,a,dpi,bleed){
        copy.activate();
        prepareDelivery(copy,a,dpi);
        if(a.colorMode==='rgb'&&String(copy.documentColorSpace)!=='DocumentColorSpace.RGB'||a.colorMode==='cmyk'&&String(copy.documentColorSpace)!=='DocumentColorSpace.CMYK'){throw Error('导出副本颜色模式不匹配：'+a.colorMode+' / '+copy.documentColorSpace);}
        var rasterSettings=copy.rasterEffectSettings;if(rasterSettings.resolution!==dpi){rasterSettings.resolution=dpi;copy.rasterEffectSettings=rasterSettings;}var options;
        if(a.format==='pdf'){options=new PDFSaveOptions();var presets=app.PDFPresetsList,preset=null;for(var pn=0;pn<presets.length;pn++)if(/^\[(High Quality Print|高质量打印|高品質列印|高品質印刷)\]$/.test(presets[pn]))preset=presets[pn];if(!preset)throw Error('未找到原生高质量打印 PDF 预设，无法确保出血尺寸正确');options.pDFPreset=preset;options.preserveEditability=a.preserveEditability===true;if(a.compression!==undefined){options.compressArt=a.compression;options.colorCompression=a.compression?CompressionQuality.ZIP8BIT:CompressionQuality.None;options.grayscaleCompression=options.colorCompression;}options.artboardRange='';options.colorDownsampling=dpi;options.grayscaleDownsampling=dpi;options.bleedLink=false;options.bleedOffsetRect=[0,0,0,0];options.colorConversionID=ColorConversion.COLORCONVERSIONREPURPOSE;if(String(copy.documentColorSpace)==='DocumentColorSpace.CMYK'){options.colorDestinationID=ColorDestination.COLORDESTINATIONWORKINGCMYK;}else{options.colorDestinationID=ColorDestination.COLORDESTINATIONWORKINGRGB;}copy.saveAs(out,options);}
        else if(a.format==='ai'){options=new IllustratorSaveOptions();if(a.compression!==undefined)options.compressed=a.compression;options.pdfCompatible=a.pdfCompatible!==false;options.embedICCProfile=true;options.embedLinkedFiles=a.embedImages===true;copy.saveAs(out,options);}
        else if(a.format==='eps'){
            options=new EPSSaveOptions();options.saveMultipleArtboards=a.target==='artboards';options.artboardRange='1';options.cmykPostScript=String(copy.documentColorSpace)==='DocumentColorSpace.CMYK';options.embedLinkedFiles=a.embedImages===true;
            var epsDir=new Folder(Folder.temp+'/AIQ_eps_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000));if(!epsDir.create())throw Error('无法创建 EPS 临时目录');
            try{copy.saveAs(new File(epsDir.fullName+'/page.eps'),options);var epsWait=0,epsFiles=epsDir.getFiles('*.eps');while((epsFiles.length!==1||!epsFiles[0].length)&&epsWait++<12){$.sleep(250);epsFiles=epsDir.getFiles('*.eps');}
                if(epsFiles.length!==1||!epsFiles[0].length||out.exists||!epsFiles[0].copy(out.fsName))throw Error('未生成唯一有效 EPS 文件');
            }finally{var epsOwned=epsDir.getFiles('*.eps');for(var ec=0;ec<epsOwned.length;ec++)if(epsOwned[ec] instanceof File)epsOwned[ec].remove();epsDir.remove();}
        }
        else if(a.format==='svg'){options=new ExportOptionsSVG();options.saveMultipleArtboards=false;copy.exportFile(out,ExportType.SVG,options);}
        else if(a.format==='png'){options=new ExportOptionsPNG24();options.antiAliasing=a.antiAliasing!==false;options.artBoardClipping=true;options.transparency=a.transparent!==false;options.horizontalScale=dpi/72*100;options.verticalScale=dpi/72*100;copy.exportFile(out,ExportType.PNG24,options);}
        else if(a.format==='tif'||a.format==='psd'){saveDeliveryRaster(copy,out,a,dpi);}
        else if(String(copy.documentColorSpace)==='DocumentColorSpace.CMYK'){cmykJPEG(copy,out,dpi,a.quality===undefined?100:a.quality);}
        else {options=new ExportOptionsJPEG();options.antiAliasing=a.antiAliasing!==false;options.artBoardClipping=true;options.qualitySetting=a.quality===undefined?100:a.quality;options.horizontalScale=dpi/72*100;options.verticalScale=dpi/72*100;copy.exportFile(out,ExportType.JPEG,options);}
        if(a.colorMode==='rgb'&&String(copy.documentColorSpace)!=='DocumentColorSpace.RGB'||a.colorMode==='cmyk'&&String(copy.documentColorSpace)!=='DocumentColorSpace.CMYK'){throw Error('保存后颜色模式不匹配：'+a.colorMode+' / '+copy.documentColorSpace);}
        // exportFile 的写盘有延迟；立即检查会把成功输出误判为失败。
        var waited=0;while((!out.exists||!out.length)&&waited<12){$.sleep(250);waited++;}
        if(!out.exists||!out.length){throw Error('未生成有效输出文件');}
        if(a.format!=='jpeg'||String(copy.documentColorSpace)!=='DocumentColorSpace.CMYK')deliveryMetadata(out,a.format,dpi,copy.artboards[0].artboardRect);
    }
    // Reassigning an unchanged selected text frame dirties a saved document in AI 30.
    function restoreDeliverySelection(d,original){
        var current=d.selection,same=current===original;
        if(!same&&current&&original&&current.length===original.length){same=true;for(var si=0;si<original.length;si++)if(current[si]!==original[si]){same=false;break;}}
        if(!same)d.selection=original;
    }
    function writeRasterRecord(name,value){
        if(!/^[a-zA-Z0-9_.-]{1,120}$/.test(name))throw Error('任务记录名称无效');
        var dir=new Folder(Folder.userData+'/AIQ-Workbench');if(!dir.exists&&!dir.create())throw Error('无法建立任务记录目录');
        var dest=new File(dir.fullName+'/'+name),temp=new File(dir.fullName+'/'+name+'.tmp');temp.encoding='UTF-8';
        if(!temp.open('w'))throw Error('无法写入任务记录');
        try{if(!temp.write(stringify(value)))throw Error('任务记录写入失败');}finally{temp.close();}
        if(dest.exists&&!dest.remove())throw Error('无法更新任务记录');
        if(!temp.rename(name))throw Error('无法发布任务记录');
    }
    function rasterPreparationProgress(a,total){
        var dir=Folder.userData+'/AIQ-Workbench/',name='export-'+a.jobId+'.json',cancel=new File(dir+'export-'+a.jobId+'.cancel');
        if(new File(dir+name).exists||new File(dir+'prepared-'+a.jobId+'.json').exists)throw Error('任务编号已使用');
        var state={jobId:a.jobId,total:total,current:0,completed:0,failed:0,completedIndexes:[],status:'running',phase:'preparing',prepared:0,startedAt:new Date().getTime(),updatedAt:0};
        function write(){state.updatedAt=new Date().getTime();writeRasterRecord(name,state);}
        write();return {state:state,stage:function(phase,message,prepared){if(cancel.exists)throw Error('导出已取消');state.phase=phase;state.message=message;if(prepared!==undefined){state.prepared=prepared;state.current=prepared;}write();},fail:function(error){state.status=cancel.exists?'cancelled':'failed';state.phase=state.status;state.message='准备未完成：'+String(error.message||error);try{write();}catch(recordError){}if(cancel.exists)cancel.remove();}};
    }
    function prepareRasterDelivery(d,cache,a){
        if(a.target!=='artboards'||!/^(jpeg|png|tif)$/.test(a.format))throw Error('独立渲染支持指定画板 JPG、PNG、TIF');
        if(!a.jobId||!/^[a-zA-Z0-9_-]{8,80}$/.test(a.jobId))throw Error('独立渲染任务编号无效');
        if(a.preparationKey!==undefined&&!/^[a-f0-9]{32}$/.test(a.preparationKey))throw Error('任务凭据无效');
        checkedBoardIndexes(d,cache,a.artboardIndexes);var indexes=a.artboardIndexes,ratio=a.scale/100,dpi=a.resolution;
        if(!indexes.length||indexes.length>1000||!isFinite(ratio)||ratio<0.01||ratio>100||!isFinite(dpi)||dpi<1||dpi>2400)throw Error('独立渲染范围或尺寸无效');
        if(boardStamp(d)!==cache.artboards)throw Error('画板已改变，请刷新');
        if(d.scaleFactor&&d.scaleFactor!==1)throw Error('大画布文档尚未验证');
        var sourceColor=String(d.documentColorSpace)==='DocumentColorSpace.CMYK'?'cmyk':'rgb',color=a.colorMode==='source'?sourceColor:a.colorMode;
        if(!/^(rgb|cmyk)$/.test(color)||a.format==='png'&&color!=='rgb')throw Error('输出颜色与格式不兼容');
        validateDeliveryOptions(a,color);
        var folder;if(a.sourceFolder){if(!String(d.path))throw Error('原稿尚未保存，请指定输出目录');folder=d.fullName.parent;}else folder=new Folder(a.folder||'');
        if(!folder.exists)throw Error('输出目录不存在');
        if(a.createSubfolder)folder=packageChild(folder,a.subfolderName);
        var bleed=a.bleedPoints||0;if(!isFinite(bleed)||bleed<0||bleed>720)throw Error('出血无效');
        var sides=a.useDocumentBleed?(a.bleedMode==='document'?documentBleed(d):[bleed,bleed,bleed,bleed]):[0,0,0,0];
        var root=new Folder(Folder.userData+'/AIQ-Workbench/raster-'+a.jobId);
        var parent=new Folder(Folder.userData+'/AIQ-Workbench');if(!parent.exists&&!parent.create())throw Error('无法建立任务目录');
        if(root.exists||!root.create())throw Error('任务目录已存在或不可写');
        var lease={file:null,openDocuments:0,released:false,saves:0},copy=null,pages=[],originalSelection=d.selection,board=d.artboards.getActiveArtboardIndex(),interaction=app.userInteractionLevel,previousFolder=Folder.current,success=false;
        var rects=[],names=[],reserved={},base=String(a.fileName||d.name.replace(/\.[^.]*$/,'')),progress=null,result=null;
        try{
            progress=rasterPreparationProgress(a,indexes.length);lease.progress=progress;
            checkDeliveryDocuments();app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
            for(var i=0;i<indexes.length;i++){
                var ab=d.artboards[indexes[i]],r=ab.artboardRect,rect=[r[0]-sides[0],r[1]+sides[1],r[2]+sides[2],r[3]-sides[3]],w=rect[2]-rect[0],h=rect[1]-rect[3];
                var px=Math.ceil(w*ratio*dpi/72),py=Math.ceil(h*ratio*dpi/72);if(px>65000||py>65000||px*py>1000000000)throw Error('成品超过独立渲染预算：单边 65000 或总像素 10 亿');
                rects.push(rect);names.push(ab.name);
                var stem=a.namingMode==='name'?base+'-'+ab.name:(a.fileName?base+'_'+('00'+(i+1)).slice(-3):ab.name);
                if(a.naming&&a.naming.enabled)stem=deliveryName(a,String(d.name).replace(/\.[^.]*$/,''),ab.name,r[2]-r[0],r[1]-r[3],sides);
                var out=nextOutput(folder,stem,a.format==='jpeg'?'jpg':a.format),suffix=1;
                while(reserved['$'+out.fsName.toLowerCase()])out=nextOutput(folder,stem+'_'+(++suffix),a.format==='jpeg'?'jpg':a.format);
                reserved['$'+out.fsName.toLowerCase()]=true;pages.push({index:indexes[i],pdf:'page-'+i+'.pdf',output:out.fsName,sizePt:[w,h]});
            }
            // Keep the original coordinate system, profiles, appearance and text threads.
            // One protected snapshot per batch; never resize or rasterize the source.
            copy=snapshotDeliveryDocument(d,sourceColor,rects,names,lease);
            // Illustrator caps live raster effects at 2400 PPI. Enlarge only the
            // protected vector copy when necessary, and compensate in the worker.
            // This keeps final pixel size/PPI unchanged without upsampling effects.
            var bridgeScale=Math.max(1,Math.ceil(dpi*ratio/2400));
            if(bridgeScale>1){prepareDelivery(copy,{format:'pdf',scale:bridgeScale*100},dpi);for(i=0;i<pages.length;i++){pages[i].sizePt[0]*=bridgeScale;pages[i].sizePt[1]*=bridgeScale;}ratio/=bridgeScale;}
            var effects=copy.rasterEffectSettings,effectDpi=Math.max(72,dpi*ratio);effects.resolution=effectDpi;copy.rasterEffectSettings=effects;
            if(Math.abs(copy.rasterEffectSettings.resolution-effectDpi)>.01)throw Error('无法按成品要求生成栅格效果');
            for(i=0;i<pages.length;i++){
                progress.stage('pdf','准备中间页 '+(i+1)+'/'+pages.length,i);
                if(new File(parent.fullName+'/export-'+a.jobId+'.cancel').exists)throw Error('导出已取消');
                var opt=new PDFSaveOptions();opt.compatibility=PDFCompatibility.ACROBAT7;opt.preserveEditability=false;
                opt.artboardRange=String(i+1);opt.bleedLink=false;opt.bleedOffsetRect=[0,0,0,0];
                opt.colorDownsampling=0;opt.grayscaleDownsampling=0;opt.monochromeDownsampling=0;
                opt.colorCompression=CompressionQuality.ZIP8BIT;opt.grayscaleCompression=CompressionQuality.ZIP8BIT;
                opt.colorConversionID=ColorConversion.None;opt.colorProfileID=ColorProfile.INCLUDEALLPROFILE;
                copy.saveAs(new File(root.fullName+'/'+pages[i].pdf),opt);
                progress.stage('pdf','中间页已准备 '+(i+1)+'/'+pages.length,i+1);
            }
            success=true;result=resultEdit('中间文件已准备，开始独立渲染',[]);
            result.rasterJob={protocol:1,jobId:a.jobId,pages:pages,folder:folder.fsName,format:a.format,color:color,ppi:dpi,scale:ratio,quality:a.quality===undefined?100:a.quality,transparent:a.transparent!==false,smoothing:a.rasterSmoothing||'high',spotPolicy:a.rasterConvertSpots===true?'preview':'reject',profile:a.rasterProfile||'source',iccPath:a.rasterIccPath||'',optimize:a.rasterOptimize!==false};
        }catch(preparationError){if(progress)progress.fail(preparationError);throw preparationError;
        }finally{
            try{if(copy)closeDeliveryDocument(copy);lease.released=true;releaseSnapshotFile(lease);}
            catch(closeError){success=false;if(progress)progress.fail(closeError);throw closeError;}
            finally{
                app.userInteractionLevel=interaction;Folder.current=previousFolder;
                try{d.activate();d.artboards.setActiveArtboardIndex(board);restoreDeliverySelection(d,originalSelection);}
                catch(restoreError){success=false;if(progress)progress.fail(restoreError);throw restoreError;}
                finally{if(!success){for(var j=0;j<pages.length;j++){var f=new File(root.fullName+'/'+pages[j].pdf);if(f.exists)f.remove();}root.remove();}}
            }
        }
        // Publish only after owned documents and source-state cleanup have actually completed.
        try{
            progress.stage('prepared','中间文件已准备，等待独立渲染',pages.length);
            if(a.preparationKey)writeRasterRecord('prepared-'+a.jobId+'.json',{schema:1,jobId:a.jobId,requestKey:a.preparationKey,workingDocumentClosed:true,job:result.rasterJob});
            result.exportProgress=progress.state;return result;
        }catch(sealError){progress.fail(sealError);for(var cleanup=0;cleanup<pages.length;cleanup++){var staged=new File(root.fullName+'/'+pages[cleanup].pdf);if(staged.exists)staged.remove();}root.remove();throw sealError;}
    }
    function exportDelivery(d,refs,cache,a){
        if(a.rasterEngine==='independent')return prepareRasterDelivery(d,cache,a);
        if(!/^(png|jpeg|svg|pdf|ai|eps|tif|psd)$/.test(a.format)){throw Error('不支持的格式');}
        if(a.format==='tif'&&a.colorMode==='cmyk'&&String(d.documentColorSpace)==='DocumentColorSpace.RGB')throw Error('RGB 稿件转 CMYK TIF 的原生路径出现宿主崩溃，已暂时停用；请使用独立渲染输出');
        if(a.collection&&!/^(ai|pdf|svg|eps)$/.test(a.format))throw Error('合集导出仅支持 AI、PDF、SVG、EPS');
        var mode=a.colorMode||'source',rgbOnly=/^(png|svg)$/.test(a.format);
        if(!/^(source|rgb|cmyk)$/.test(mode)){throw Error('不支持的导出颜色模式');}
        if(rgbOnly&&mode==='cmyk'){throw Error('当前 '+a.format.toUpperCase()+' 导出仅支持 RGB，请使用 PDF、AI 或 EPS 输出 CMYK');}
        var deliveryColor=mode;
        if(rgbOnly)deliveryColor='rgb';
        else if(mode==='source'){
            deliveryColor='rgb';if(String(d.documentColorSpace)==='DocumentColorSpace.CMYK')deliveryColor='cmyk';
        }
        var dpi=a.resolution===undefined?300:a.resolution,bleed=a.bleedPoints===undefined?0:a.bleedPoints;
        if(!isFinite(dpi)||dpi<1||dpi>2400||!isFinite(bleed)||bleed<0||bleed>720){throw Error('分辨率或出血超出范围');}
        if(a.quality!==undefined&&(!isFinite(a.quality)||a.quality<0||a.quality>100)){throw Error('JPEG 品质须为 0–100');}
        try{if(d.scaleFactor&&d.scaleFactor!==1){throw Error('大画布缩放文档尚未验证，请使用普通画布');}}catch(scaleError){if(String(scaleError.message).indexOf('大画布')>=0)throw scaleError;}
        validateDeliveryOptions(a,deliveryColor);checkDeliveryDocuments();
        if(a.screenExport===true&&(a.target!=='artboards'||deliveryColor!=='rgb'||screenDeliveryType(a,deliveryColor)===null||a.useDocumentBleed||a.outlineText||a.overprintBlack))throw Error('屏幕导出仅支持 RGB 画板 PNG/JPEG，不含出血、转曲或叠印');
        var folder;if(a.sourceFolder){try{folder=d.fullName.parent;}catch(noSource){throw Error('源文档未保存，请指定目录');}}else{folder=new Folder(a.folder||'');}if(!a.folder&&!a.sourceFolder||!folder.exists){throw Error('请选择有效输出目录');}
        var selectedBoards=a.artboardIndexes,roots=[],i,j,files=[],skipped=[],copy=null,snapshotLease={file:null,openDocuments:0,released:false,saves:0},interaction=app.userInteractionLevel,activeBoard=d.artboards.getActiveArtboardIndex(),originalSelection=d.selection;
        if(cache.unit!==documentUnit(d)){throw Error('文档单位已改变，请刷新后重试');}var screenBatch=null,screenBatches=0;var stage='准备',directPages=0,copyCount=0,copiedObjects=0,consecutiveFailures=0;var base=String(a.fileName||d.name.replace(/\.[^.]*$/,'')).replace(/\.(png|jpe?g|svg|pdf|ai|eps)$/i,'');var sourceBoardName=String(d.artboards[activeBoard].name);var namingDoc=String(d.name).replace(/\.[^.]*$/,'');
        if(a.target==='objects'){roots=exportRoots(refs);if(!roots.length){throw Error('请选择对象，空选区不扩大范围');}}
        else {
            if(!(selectedBoards instanceof Array)||!selectedBoards.length){throw Error('请选择画板');}
            if(boardStamp(d)!==cache.artboards){throw Error('画板已改变，请刷新后重选');}
            var seen={};for(i=0;i<selectedBoards.length;i++){var ix=selectedBoards[i];if(typeof ix!=='number'||ix%1||ix<0||ix>=d.artboards.length||seen[ix]){throw Error('画板编号无效或重复');}seen[ix]=true;}
        }
        // Validate a single child name after target validation, before creating any output.
        if(a.createSubfolder){
            var childName=String(a.subfolderName||'');
            if(!childName||childName.length>100||/^[ .]|[ .]$|[<>:"\/\\|?*\x00-\x1f]/.test(childName)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(childName)){throw Error('子目录名称无效，请使用单个文件夹名称');}
            var parentFolder=folder,childFolder=new Folder(folder.fullName+'/'+encodeURIComponent(childName));
            if(childFolder.parent.fsName!==parentFolder.fsName||childFolder.alias){throw Error('子目录必须位于当前目录内，不能使用快捷方式');}
            if(!childFolder.exists&&!childFolder.create()){throw Error('无法建立子目录，请检查目录权限');}
            folder=childFolder;
        }
        // 使用出血时每个所选画板四边向外扩展（覆盖画板外预留的出血内容），页序不变。
        var bleedSides=a.useDocumentBleed===true?(a.bleedMode==='document'?documentBleed(d):[bleed,bleed,bleed,bleed]):[0,0,0,0],bleedUse=0;
        var progress=deliveryProgress(a,a.target==='objects'?roots.length:selectedBoards.length);
        function bleedRect(r){return [r[0]-bleedSides[0],r[1]+bleedSides[1],r[2]+bleedSides[2],r[3]-bleedSides[3]];}
        try {
            app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
            if(a.collection===true){
                if(progress&&!progress.step(1))throw Error('导出已取消');
                var collectionRects=[],collectionNames=[],union=null;
                if(a.target==='artboards')for(i=0;i<selectedBoards.length;i++){var cb=d.artboards[selectedBoards[i]],cr=bleedRect(cb.artboardRect);collectionRects.push(cr);collectionNames.push(String(cb.name));union=mergeBox(union,bounds(cr));}
                else for(i=0;i<roots.length;i++){var ob=exportBounds(roots[i]);union=mergeBox(union,ob);}
                if(!union)throw Error('合集范围为空');
                var unionRect=bounds(union);preflightDeliveryRect(unionRect,a,dpi);
                copy=newDeliveryDocument(deliveryColor,union[2]-union[0],union[3]-union[1],0);copyCount++;
                copy.artboards[0].artboardRect=unionRect;copy.artboards[0].name='合集';
                if(a.target==='artboards'){
                    var collectionPlan=planDeliveryLayers(d,collectionRects,(a.scale!==100&&a.scale!==undefined)||a.overprintBlack?5000:50000);
                    if(canSnapshotDelivery(d,a,deliveryColor)){closeDeliveryDocument(copy);copy=null;copy=snapshotDeliveryDocument(d,deliveryColor,collectionRects,collectionNames,snapshotLease);}
                    else copyDeliveryPlan(collectionPlan,copy);
                    copiedObjects+=collectionPlan.objectCount;restrictVectorDelivery(copy,collectionRects);
                    if(a.format==='ai'){copy.artboards[0].artboardRect=collectionRects[0];copy.artboards[0].name=collectionNames[0];for(i=1;i<collectionRects.length;i++){if(i<copy.artboards.length){copy.artboards[i].artboardRect=collectionRects[i];copy.artboards[i].name=collectionNames[i];}else{var ca=copy.artboards.add(collectionRects[i]);ca.name=collectionNames[i];}}}
                    else{for(i=copy.artboards.length-1;i>0;i--)copy.artboards[i].remove();copy.artboards[0].artboardRect=unionRect;}
                }else{
                    roots.sort(function(left,right){var l=deliveryStackOrder(left),r=deliveryStackOrder(right);for(var n=0;n<Math.min(l.length,r.length);n++)if(l[n]!==r[n])return l[n]-r[n];return l.length-r.length;});
                    for(i=0;i<roots.length;i++)copyExportObject(roots[i],copy);
                }
                var collectionStem=a.fileName||base+'-合集';
                if(a.naming&&a.naming.enabled)collectionStem=deliveryName(a,namingDoc,'合集',union[2]-union[0],union[3]-union[1],bleedSides);
                var collectionFile=nextOutput(folder,collectionStem,a.format);
                try{saveDelivery(copy,collectionFile,a,dpi,bleed);files.push(decodeURI(collectionFile.name));if(progress)for(i=0;i<(a.target==='objects'?roots.length:selectedBoards.length);i++)progress.done(a.target==='objects'?i:selectedBoards[i]);}
                catch(collectionError){if(collectionFile.exists)collectionFile.remove();throw collectionError;}
            }else if(a.target==='objects'){
                for(i=0;i<roots.length;i++){if(progress&&!progress.step(i+1))break;var out=null;try{
                    d.activate();var b=exportBounds(roots[i]);preflightDeliveryRect([b[0],-b[1],b[2],-b[3]],a,dpi);if(roots[i].typename==='GroupItem'&&roots[i].pageItems.length>50000)throw Error('对象组过大，请拆分导出');var nameWidth=b[2]-b[0],nameHeight=b[3]-b[1];positive(b[2]-b[0]);positive(b[3]-b[1]);if(copy){clearDeliveryDocument(copy);}else{copy=newDeliveryDocument(deliveryColor,b[2]-b[0],b[3]-b[1],0);copyCount++;}b=copyExportObject(roots[i],copy);copy.artboards[0].artboardRect=[b[0],-b[1],b[2],-b[3]];
                    var stem=roots[i].name||'对象_'+('00'+(i+1)).slice(-3);if(a.fileName)stem=a.fileName+'_'+('00'+(i+1)).slice(-3);if(a.namingMode==='name')stem=base+'-'+sourceBoardName+(roots.length>1?'-'+('00'+(i+1)).slice(-3):'');if(a.naming&&a.naming.enabled)stem=deliveryName(a,namingDoc,sourceBoardName,nameWidth,nameHeight,bleedSides)+(roots.length>1?'-'+('00'+(i+1)).slice(-3):'');out=nextOutput(folder,stem,a.format==='jpeg'?'jpg':a.format);saveDelivery(copy,out,a,dpi,bleed);files.push(decodeURI(out.name));consecutiveFailures=0;if(progress)progress.done(i);
                }catch(objectError){skipped.push({objectId:'object-'+(i+1),reason:String(objectError.message||objectError)});if(objectError.aiqPendingPhotoshop===true)break;if(out&&out.exists){out.remove();}if(++consecutiveFailures>=3){skipped.push({objectId:'batch-stop',reason:'连续 3 项失败，已停止后续导出'});break;}}
                finally{if(copy&&!/^(png|jpeg|svg)$/.test(a.format)){try{closeDeliveryDocument(copy);copy=null;}catch(closeError){skipped.push({objectId:'cleanup',reason:'工作副本关闭失败，已停止后续导出'});break;}}d.activate();}}
            }else{
                if(a.format==='pdf'){
                    if(progress&&!progress.step(1))throw Error('导出已取消');
                    stage='读取页面';var pages=[];for(i=0;i<selectedBoards.length;i++){var page=d.artboards[selectedBoards[i]];pages.push({nameRect:[page.artboardRect[0],page.artboardRect[1],page.artboardRect[2],page.artboardRect[3]],rect:bleedRect(page.artboardRect),name:page.name,unit:documentUnit(d),colors:a.annotation&&a.annotation.enabled&&a.annotation.colors?annotationColors(d,bounds(page.artboardRect)):null});}
                    var allRects=[];for(i=0;i<pages.length;i++){preflightDeliveryRect(pages[i].rect,a,dpi);allRects.push(pages[i].rect);}stage='规划页面对象';var pdfPlan=planDeliveryLayers(d,allRects,(a.scale!==100&&a.scale!==undefined)||a.overprintBlack?5000:50000);
                    stage='建立副本';var first=pages[0].rect;copyCount++;var snapshot=canSnapshotDelivery(d,a,deliveryColor);if(snapshot){var pageNames=[];for(i=0;i<pages.length;i++)pageNames.push(pages[i].name);copy=snapshotDeliveryDocument(d,deliveryColor,allRects,pageNames,snapshotLease);}else copy=newDeliveryDocument(deliveryColor,first[2]-first[0],first[1]-first[3],bleedUse);
                    stage='设置首页';copy.artboards[0].artboardRect=first;copy.artboards[0].name=pages[0].name;
                    stage='添加后续页';if(!snapshot)for(i=1;i<pages.length;i++){var added=copy.artboards.add(pages[i].rect);added.name=pages[i].name;}
                    stage='复制页面结构';if(!snapshot)copyDeliveryPlan(pdfPlan,copy);copiedObjects+=pdfPlan.objectCount;
                    restrictVectorDelivery(copy,allRects);
                    stage='添加标注';copy.activate();for(i=0;i<pages.length;i++){addDeliveryLabel(copy,pages[i],i,a,dpi,bleed);}
                    stage='保存PDF';var pdfStem=base;if(a.namingMode==='name'){pdfStem=base+'-'+(pages.length===1?pages[0].name:'画板合集');}if(a.naming&&a.naming.enabled){if(pages.length>1){for(var np=1;np<pages.length;np++){if(Math.abs((pages[np].nameRect[2]-pages[np].nameRect[0])-(pages[0].nameRect[2]-pages[0].nameRect[0]))>0.001||Math.abs((pages[np].nameRect[1]-pages[np].nameRect[3])-(pages[0].nameRect[1]-pages[0].nameRect[3]))>0.001){for(var nb=0;nb<a.naming.blocks.length;nb++){if(a.naming.blocks[nb].enabled&&a.naming.blocks[nb].kind==='size')throw Error('混合尺寸 PDF 合集请关闭尺寸命名块，或逐画板导出');}}}}pdfStem=deliveryName(a,namingDoc,pages.length===1?pages[0].name:'画板合集',pages[0].nameRect[2]-pages[0].nameRect[0],pages[0].nameRect[1]-pages[0].nameRect[3],bleedSides);}var pdf=nextOutput(folder,pdfStem,'pdf');try{saveDelivery(copy,pdf,a,dpi,bleed);files.push(decodeURI(pdf.name));if(progress)for(var pi=0;pi<selectedBoards.length;pi++)progress.done(selectedBoards[pi]);}catch(pdfError){if(pdf.exists){pdf.remove();}throw pdfError;}
                }else{
                    // Freeze names/rectangles once; no document creation per page for a raster batch.
                    stage='预检画板';var boardPages=[],rects=[],canDirect=canDirectDelivery(d,a,dpi,deliveryColor,bleedSides);
                    var reuseContent=/^(png|jpeg)$/.test(a.format)&&(a.scale===undefined||a.scale===100)&&!a.outlineText&&!a.overprintBlack;
                    var recycleWorker=/^(png|jpeg|svg)$/.test(a.format),batchPlan=null;
                    if(!canDirect&&canSnapshotDelivery(d,a,deliveryColor)){reuseContent=false;recycleWorker=false;}
                    for(i=0;i<selectedBoards.length;i++){var srcBoard=d.artboards[selectedBoards[i]],sourceRect=srcBoard.artboardRect;var pageRect=[sourceRect[0],sourceRect[1],sourceRect[2],sourceRect[3]],expanded=bleedRect(pageRect);preflightDeliveryRect(expanded,a,dpi);boardPages.push({index:selectedBoards[i],name:String(srcBoard.name),rect:expanded,net:pageRect});rects.push(expanded);}
                    if(!canDirect&&reuseContent){stage='规划工作副本';batchPlan=planDeliveryLayers(d,rects,50000);}
                    for(i=0;i<boardPages.length;i++){
                        if(progress&&!progress.step(i+1))break;
                        var bp=boardPages[i],out2=null;
                        try{
                            stage='导出画板 '+(i+1)+'/'+boardPages.length;
                            var stem2=bp.name;if(a.fileName)stem2=a.fileName+'_'+('00'+(i+1)).slice(-3);if(a.namingMode==='name')stem2=base+'-'+bp.name;
                            if(a.naming&&a.naming.enabled)stem2=deliveryName(a,namingDoc,bp.name,bp.net[2]-bp.net[0],bp.net[1]-bp.net[3],bleedSides);
                            out2=nextOutput(folder,stem2,a.format==='jpeg'?'jpg':a.format);
                            if(canDirect){
                                if(canBatchScreens(d,a,deliveryColor)){
                                    if(!screenBatch||i>=screenBatch.end){clearScreenBatch(screenBatch);screenBatch=createScreenBatch(d,boardPages,i,a,dpi,deliveryColor);screenBatches++;}
                                    if(a.format==='jpeg'&&deliveryColor==='rgb')nativeRGBJPEG(screenBatch.files[i],out2,a.quality===undefined?100:a.quality);
                                    else if(out2.exists||!screenBatch.files[i].copy(out2.fsName))throw Error('无法写入屏幕导出文件');
                                    deliveryMetadata(out2,a.format,dpi,bp.rect);
                                }else saveDirectDelivery(d,bp.index,out2,a,dpi,bp.rect);
                                directPages++;
                            }
                            else{
                                var pagePlan=batchPlan;
                                if(!reuseContent){d.activate();pagePlan=planDeliveryLayers(d,[bp.rect],(a.scale!==100&&a.scale!==undefined)||a.overprintBlack?5000:50000);}
                                var needsContent=!copy||!reuseContent;
                                var nativeSnapshot=!copy&&canSnapshotDelivery(d,a,deliveryColor);
                                if(!copy){copy=nativeSnapshot?snapshotDeliveryDocument(d,deliveryColor,[bp.rect],[bp.name],snapshotLease):newDeliveryDocument(deliveryColor,bp.rect[2]-bp.rect[0],bp.rect[1]-bp.rect[3],0);copyCount++;}
                                else if(!reuseContent){clearDeliveryDocument(copy);}
                                copy.activate();copy.artboards[0].artboardRect=bp.rect;copy.artboards[0].name=bp.name;
                                if(needsContent){if(!nativeSnapshot)copyDeliveryPlan(pagePlan,copy);copiedObjects+=pagePlan.objectCount;}
                                if(/^(ai|eps|svg)$/.test(a.format))restrictVectorDelivery(copy,[bp.rect]);
                                saveDelivery(copy,out2,a,dpi,0);
                            }
                            files.push(decodeURI(out2.name));consecutiveFailures=0;if(progress)progress.done(bp.index);
                        }catch(boardError){
                            if(out2&&out2.exists)out2.remove();skipped.push({objectId:'artboard-'+(bp.index+1),reason:String(boardError.message||boardError)});if(boardError.aiqPendingPhotoshop===true)break;
                            // A failed worker may contain partially transformed artwork. Retire it.
                            if(copy){try{closeDeliveryDocument(copy);copy=null;}catch(closeError){skipped.push({objectId:'cleanup',reason:'工作副本关闭失败，已停止后续导出'});break;}}
                            if(++consecutiveFailures>=3){skipped.push({objectId:'batch-stop',reason:'连续 3 项失败，已停止后续导出'});break;}
                        }
                        if(copy&&!recycleWorker){try{closeDeliveryDocument(copy);copy=null;}catch(closeError2){skipped.push({objectId:'cleanup',reason:'工作副本关闭失败，已停止后续导出'});break;}}
                    }
                }
            }
            var result=resultEdit('已导出 '+files.length+' 个文件'+(a.target==='artboards'?' · '+selectedBoards.length+' 页':'')+(skipped.length?'，失败 '+skipped.length+' 项':''),files.length?['file-export']:[],skipped);if(skipped.length)result.message+='；'+skipped[0].reason;result.files=files;result.folder=folder.fsName;result.exportMetrics={screenBatches:screenBatches,directPages:directPages,workingDocuments:copyCount,copiedObjects:copiedObjects,snapshotSaves:snapshotLease.saves};if(progress&&progress.state.status==='cancelled'){result.status='partial';result.message+='；已取消后续导出';}if(!files.length&&(!progress||progress.state.status!=='cancelled')){result.status='failed';result.error={code:'EXPORT_FAILED',message:skipped.length?skipped[0].reason:'未生成文件'};}return result;
        }catch(deliveryError){throw Error(stage+'：'+String(deliveryError.message||deliveryError));}finally{clearScreenBatch(screenBatch);if(copy){try{closeDeliveryDocument(copy);copy=null;}catch(finalClose){if(result){result.status='partial';result.skipped.push({objectId:'cleanup',reason:'工作副本未能关闭，请手动关闭后再导出'});result.message+='；工作副本未能关闭';}}}snapshotLease.released=true;try{releaseSnapshotFile(snapshotLease);}catch(snapshotCleanup){if(result){result.status='partial';result.skipped.push({objectId:'cleanup',reason:String(snapshotCleanup.message)});result.message+='；快照清理失败';}}if(progress){try{var failedItems=0;for(var fi=0;fi<skipped.length;fi++)if(/^(object-|artboard-)/.test(skipped[fi].objectId))failedItems++;progress.finish(result?failedItems:Math.max(1,failedItems),skipped.length>0);if(result){result.exportProgress=progress.state;if(progress.state.recordFailed)result.message+='；部分进度记录写入失败';}}catch(progressError){if(result){result.message+='；进度记录写入失败';result.status='partial';}}}app.userInteractionLevel=interaction;try{d.activate();d.artboards.setActiveArtboardIndex(activeBoard);restoreDeliverySelection(d,originalSelection);}catch(selectionRestore){}}
    }

    function packageChild(parent,name){
        if(typeof name!=='string'||!name||name.length>100||/^[ .]|[ .]$|[<>:"\/\\|?*\x00-\x1f]/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('打包目录名称无效');
        var folder=new Folder(parent.fullName+'/'+encodeURIComponent(name));
        if(folder.parent.fsName!==parent.fsName||folder.alias)throw Error('目录必须位于所选父目录内');return folder;
    }
    // Read sfnt name/OS2 tables only, never load full font payloads into memory.
    function packageFontNames(file){
        function u16(s,p){return s.charCodeAt(p)*256+s.charCodeAt(p+1);}
        function u32(s,p){return u16(s,p)*65536+u16(s,p+2);}
        function read(at,count){if(at<0||count<0||at+count>file.length)throw Error('Invalid font table');file.seek(at);var s=file.read(count);if(s.length!==count)throw Error('Truncated font');return s;}
        var result=[];
        try{file.encoding='BINARY';if(!file.open('r'))return result;var header=read(0,12),offsets=[0];
            if(header.substr(0,4)==='ttcf'){var count=u32(header,8);if(count>128)return result;var index=read(12,count*4);offsets=[];for(var n=0;n<count;n++)offsets.push(u32(index,n*4));}
            for(var face=0;face<offsets.length;face++){
                var head=read(offsets[face],12),tables=u16(head,4);if(tables>128)continue;var directory=read(offsets[face]+12,tables*16),nameOffset=0,nameLength=0,restricted=false;
                for(var t=0;t<tables;t++){var at=t*16,tag=directory.substr(at,4),offset=u32(directory,at+8),length=u32(directory,at+12);if(tag==='name'){nameOffset=offset;nameLength=length;}if(tag==='OS/2'&&length>=10){var os=read(offset,10);restricted=(u16(os,8)&2)!==0;}}
                if(!nameOffset||nameLength>1048576)continue;var table=read(nameOffset,nameLength),records=u16(table,2),strings=u16(table,4);
                for(var k=0;k<records&&6+k*12+12<=table.length;k++){var pos=6+k*12,platform=u16(table,pos),id=u16(table,pos+6),len=u16(table,pos+8),off=strings+u16(table,pos+10);if(id!==6||off+len>table.length)continue;var name='';
                    if(platform===0||platform===3){for(var ch=0;ch<len;ch+=2)name+=String.fromCharCode(u16(table,off+ch));}else if(platform===1)name=table.substr(off,len);
                    if(name)result.push({name:name,restricted:restricted});
                }
            }
        }catch(unreadable){}finally{try{file.close();}catch(ignore){}}return result;
    }
    function packageResources(doc,withColors,onProgress){
        var fonts={},used={},swatches=[],fontWarnings=[],colorWarnings=[],unknown=0,runs=0,i,j;
        function paint(c){var spec=color(c);if(spec.kind==='none')return;if(spec.kind==='unknown'){unknown++;return;}used['$'+spec.colorId]=spec;}
        // getTextRunLength advances a complete native style run, including mixed fonts.
        var packageStories=doc.stories,packageStoryCount=packageStories.length;
        for(i=0;i<packageStoryCount;i++){
            if(onProgress&&i%32===0)onProgress();
            var warned=false;
            function unreadableFont(){if(!warned){fontWarnings.push({objectId:'font-story-'+(i+1),reason:'第 '+(i+1)+' 个文字故事的字体属性无法完整读取，相关字体未确认收集；请在 Illustrator 中检查缺失字体'});warned=true;}}
            try{
                var chars=packageStories[i].textRange.characters,total=chars.length;
                for(j=0;j<total;){
                    if(++runs>200000)throw Error('文字样式片段超过 20 万，请拆分打包');
                    var r=chars[j];r.length=total-j;var ca=r.characterAttributes;
                    try{var font=ca.textFont;fonts['$'+font.name]={name:font.name,family:font.family,style:font.style};}catch(fontError){unreadableFont();}
                    if(withColors){try{paint(ca.fillColor);paint(ca.strokeColor);}catch(colorError){unknown++;}}
                    var step=r.getTextRunLength();if(!isFinite(step)||step<=j||step>total){unreadableFont();break;}j=step;
                }
            }catch(storyError){if(runs>200000)throw storyError;unreadableFont();if(withColors)unknown++;}
        }
        if(withColors){
            var colorDeadline=new Date().getTime()+15000,packagePaths=doc.pathItems,packagePathCount=packagePaths.length;
            for(i=0;i<packagePathCount;i++){if(i%32===0&&new Date().getTime()>colorDeadline){colorWarnings.push({objectId:'colors-incomplete',reason:'使用色扫描达到 15 秒预算：仅扫描 '+i+'/'+packagePathCount+' 条路径，其余未统计；颜色清单不完整'});break;}if(onProgress&&i%256===0)onProgress();var p=packagePaths[i];if(p.filled)paint(p.fillColor);if(p.stroked)paint(p.strokeColor);}
            var packageItems=doc.pageItems,packageItemCount=packageItems.length;
            for(i=0;i<packageItemCount;i++){if(i%32===0&&new Date().getTime()>colorDeadline){colorWarnings.push({objectId:'inventory-incomplete',reason:'复杂对象统计仅扫描 '+i+'/'+packageItemCount+' 项，剩余未统计，不能按零处理'});break;}if(onProgress&&i%256===0)onProgress();if(!/^(TextFrame|PathItem|CompoundPathItem|GroupItem)$/.test(packageItems[i].typename))unknown++;}
            var packageSwatches=doc.swatches,packageSwatchCount=packageSwatches.length;
            for(i=0;i<packageSwatchCount;i++){var sw=packageSwatches[i];swatches.push({name:sw.name,color:color(sw.color)});}
        }
        var fontList=[],colors=[];for(var key in fonts)if(fonts.hasOwnProperty(key))fontList.push(fonts[key]);for(key in used)if(used.hasOwnProperty(key))colors.push(used[key]);return {fonts:fontList,fontWarnings:fontWarnings,colorWarnings:colorWarnings,colors:colors,swatches:swatches,unknown:unknown,runs:runs};
    }
    function collectPackageFonts(resources,root,files,skipped){
        var warnings=(resources.fontWarnings||[]).concat(resources.colorWarnings||[]);for(var warning=0;warning<warnings.length;warning++)skipped.push(warnings[warning]);
        if(!resources.fonts.length)return;
        var wanted={},found={},copied={},fontFolder=packageChild(root,'Fonts'),i,j,k;
        for(i=0;i<resources.fonts.length;i++)wanted['$'+resources.fonts[i].name]=true;
        var systemRoot=$.getenv('WINDIR')||'C:/Windows';
        var folders=[new Folder(systemRoot+'/Fonts'),new Folder(Folder.userData.parent.fullName+'/Local/Microsoft/Windows/Fonts')];
        for(i=0;i<folders.length;i++){if(!folders[i].exists)continue;var candidates=folders[i].getFiles(function(f){return f instanceof File&&/\.(ttf|otf|ttc)$/i.test(f.name);});
            for(j=0;j<candidates.length;j++){var matches=packageFontNames(candidates[j]),needed=[];for(k=0;k<matches.length;k++)if(wanted['$'+matches[k].name]&&!found['$'+matches[k].name]&&!matches[k].restricted)needed.push(matches[k].name);if(!needed.length)continue;
                if(!fontFolder.exists&&!fontFolder.create())throw Error('无法创建字体目录');var source=candidates[j],path='$'+source.fsName,dest=copied[path];
                if(!dest){dest=nextOutput(fontFolder,decodeURI(source.name).replace(/\.[^.]*$/,''),decodeURI(source.name).split('.').pop());if(!source.copy(dest.fsName)||!dest.exists||dest.length!==source.length)throw Error('字体复制失败');copied[path]=dest;files.push('Fonts/'+decodeURI(dest.name));}
                for(k=0;k<needed.length;k++)found['$'+needed[k]]=decodeURI(dest.name);
            }
        }
        for(i=0;i<resources.fonts.length;i++){var font=resources.fonts[i];font.file=found['$'+font.name]||null;if(!font.file)skipped.push({objectId:'font-'+(i+1),reason:'字体 '+font.name+' 未收集：未定位本机字体文件或字体限制复制'});}
    }
    function savePackageCopy(doc,file,pdfCompatible){
        doc.activate();deliveryAction('adobe_saveACopyAs',[[1851878757,'ustring',file.fsName],[1718775156,'ustring','Adobe Illustrator Any Format Writer'],[1702392942,'ustring','ai,ait'],[1885627936,'boolean',pdfCompatible===false?0:1]]);
        var n=0;while((!file.exists||!file.length)&&n++<12)$.sleep(250);if(!file.exists||!file.length)throw Error('无法保存完整 AI 副本');
    }
    function collectPackageLinks(copy,root,files,skipped,onProgress){
        var folder=packageChild(root,'Links'),copied={},i,j,links=copy.placedItems,linkCount=links.length;
        for(i=0;i<linkCount;i++){if(onProgress)onProgress();var item=links[i],flags=[];
            try{var source=item.file;if(!source||!source.exists)throw Error('链接文件缺失');var key='$'+source.fsName,target=copied[key];
                if(!target){if(!folder.exists&&!folder.create())throw Error('无法创建链接目录');var decoded=decodeURI(source.name),dot=decoded.lastIndexOf('.');if(dot<1)throw Error('链接文件扩展名未知');target=nextOutput(folder,decoded.substring(0,dot),decoded.substring(dot+1));if(!source.copy(target.fsName)||!target.exists||source.length!==target.length)throw Error('链接文件复制失败');copied[key]=target;files.push('Links/'+decodeURI(target.name));}
                var parent=item;while(parent&&parent.typename!=='Document'){if(parent.locked){flags.push(parent);parent.locked=false;}parent=parent.parent;}item.relink(target);
                if(item.file.fsName!==target.fsName)throw Error('副本链接未更新');
            }catch(linkError){skipped.push({objectId:'link-'+(i+1),reason:String(linkError.message||linkError)});}finally{for(j=flags.length-1;j>=0;j--)try{flags[j].locked=true;}catch(ignore){}}
        }
    }
    function writePackageReport(file,doc,a,resources,files,skipped){
        var unit=documentUnit(doc),factor=unitScale(unit),ratio=a.scale/100,lines=['# 文件打包说明','','文档：'+doc.name,'画板数量：'+doc.artboards.length,'AI 兼容 PDF：'+(a.pdfCompatible===false?'关闭':'开启'),'原稿颜色模式：'+(String(doc.documentColorSpace)==='DocumentColorSpace.CMYK'?'CMYK':'RGB'),'附件缩放：'+a.scale+'%（'+ratio+' 倍）','附件分辨率：'+a.resolution+' ppi','附件颜色模式：'+a.colorMode+'；PNG 为 RGB','附件格式：'+a.formats.join(', ')+'；PDF '+(a.splitPDF?'逐画板':'合集'),'原稿与转曲 AI 保持原尺寸；附件不额外添加出血。','','## 画板'];
        function clean(s){return String(s).replace(/[\r\n]/g,' ');}function value(n){return (n/factor).toFixed(4);}
        function describe(c){if(c.kind==='none')return '无';if(c.kind==='unknown')return '未解析';if(c.kind==='gradient')return '渐变 '+clean(c.name);if(c.kind==='spot'||c.kind==='spot-tint')return '专色 '+clean(c.name)+' / 色调 '+c.values[0]+'%';return (c.kind==='process-cmyk'?'CMYK':c.kind.toUpperCase())+' '+c.values.join(' / ');}
        for(var i=0;i<doc.artboards.length;i++){var board=doc.artboards[i],r=board.artboardRect,w=r[2]-r[0],h=r[1]-r[3];lines.push((i+1)+'. '+clean(board.name)+'：原始 '+value(w)+' × '+value(h)+' '+unit+'；附件成品 '+value(w*ratio)+' × '+value(h*ratio)+' '+unit);}
        lines.push('','## 字体（完整故事，包含隐藏及锁定文字）');for(i=0;i<resources.fonts.length;i++){var f=resources.fonts[i];lines.push('- '+clean(f.family)+' / '+clean(f.style)+' / '+clean(f.name)+'：'+(f.file?'Fonts/'+f.file:'未收集'));}
        lines.push('','## 使用颜色（可读取的路径和文字，包含隐藏及锁定内容）');for(i=0;i<resources.colors.length;i++)lines.push('- '+describe(resources.colors[i]));
        lines.push('图片、符号、复杂外观等不作完整解析；检测到未解析对象/颜色：'+resources.unknown,'渐变按资源名称记录，不将外部图片内部颜色计为零。','','## 色板库存（不表示实际使用）');for(i=0;i<resources.swatches.length;i++)lines.push('- '+clean(resources.swatches[i].name)+'：'+describe(resources.swatches[i].color));
        lines.push('','## 已生成文件');for(i=0;i<files.length;i++)lines.push('- '+files[i]);
        lines.push('','## 未完成项');if(!skipped.length)lines.push('无已检测到的失败；字体收集范围为系统与当前用户字体目录。');for(i=0;i<skipped.length;i++)lines.push('- '+clean(skipped[i].reason));
        if(a.report==='txt')for(i=0;i<lines.length;i++)lines[i]=lines[i].replace(/^#+ /,'');
        file.encoding='UTF-8';try{if(!file.open('w')||!file.write(lines.join('\r\n')))throw Error('无法写入说明文档');}finally{file.close();}if(!file.exists||!file.length)throw Error('说明文档为空');
    }
    function packageDelivery(d,cache,a){
        if(!a.folder||!new Folder(a.folder).exists)throw Error('请选择有效的打包父目录');
        if(!(a.formats instanceof Array)||a.formats.length>3)throw Error('附件格式无效');var seen={},i;
        for(i=0;i<a.formats.length;i++){var fmt=a.formats[i];if(!/^(jpeg|png|pdf)$/.test(fmt)||seen[fmt])throw Error('附件格式无效或重复');seen[fmt]=true;}
        if(a.report!==null&&a.report!=='md'&&a.report!=='txt')throw Error('说明文档格式无效');
        if(a.pdfCompatible!==undefined&&typeof a.pdfCompatible!=='boolean')throw Error('AI 兼容设置无效');
        if(typeof a.outline!=='boolean'||typeof a.splitPDF!=='boolean'||typeof a.resolution!=='number'||!isFinite(a.resolution)||a.resolution<1||a.resolution>2400||typeof a.scale!=='number'||!isFinite(a.scale)||a.scale<1||a.scale>10000||!/^(source|rgb|cmyk)$/.test(a.colorMode))throw Error('打包设置无效');
        if(boardStamp(d)!==cache.artboards||cache.unit!==documentUnit(d))throw Error('画板或单位已改变，请刷新');
        var parent=new Folder(a.folder),root=packageChild(parent,a.name),suffix=1;
        while(root.exists){root=packageChild(parent,a.name+'-'+(++suffix));if(suffix>999)throw Error('同名打包目录过多');}
        if(a.outputSubfolder)packageChild(root,a.outputSubfolder);
        checkDeliveryDocuments();var level=app.userInteractionLevel,copy=null,files=[],skipped=[],reportFile=null,resources=null,progress=null,result=null;
        try{
            app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
            if(!root.create())throw Error('无法建立打包目录');
            progress=deliveryProgress(a,4+(a.outline?1:0)+a.formats.length+(a.report?1:0));var step=0;
            function advance(){if(progress&&!progress.step(++step))throw Error('已取消后续打包');}
            function done(){if(progress)progress.done(step-1);}
            advance();resources=packageResources(d,!!a.report,function(){if(progress&&!progress.step(step))throw Error('已取消后续打包');});done();
            advance();var base=nextOutput(root,String(d.name).replace(/\.[^.]*$/,''),'ai');savePackageCopy(d,base,a.pdfCompatible);files.push(decodeURI(base.name));done();
            advance();var stageFailures=skipped.length;copy=app.open(base);ownedDeliveryDocuments.push(copy);collectPackageLinks(copy,root,files,skipped,function(){if(progress&&!progress.step(step))throw Error('已取消后续打包');});var baseOptions=new IllustratorSaveOptions();baseOptions.pdfCompatible=a.pdfCompatible!==false;baseOptions.embedICCProfile=true;copy.saveAs(base,baseOptions);closeDeliveryDocument(copy);copy=null;d.activate();if(skipped.length===stageFailures)done();
            advance();stageFailures=skipped.length;collectPackageFonts(resources,root,files,skipped);if(skipped.length===stageFailures)done();
            if(a.outline){advance();var outlined=nextOutput(root,String(d.name).replace(/\.[^.]*$/,'')+'-文字转曲','ai');
                try{copy=app.open(base);ownedDeliveryDocuments.push(copy);outlineDeliveryText(copy);var saveOptions=new IllustratorSaveOptions();saveOptions.pdfCompatible=a.pdfCompatible!==false;saveOptions.embedICCProfile=true;copy.saveAs(outlined,saveOptions);if(!outlined.exists||!outlined.length)throw Error('转曲副本未生成');files.push(decodeURI(outlined.name));done();}
                catch(outlineError){if(outlined.exists)outlined.remove();skipped.push({objectId:'outline',reason:'转曲副本：'+outlineError.message});}
                finally{if(copy){closeDeliveryDocument(copy);copy=null;}d.activate();}
            }
            var output=root;if(a.outputSubfolder&&a.formats.length){output=packageChild(root,a.outputSubfolder);if(!output.exists&&!output.create())throw Error('无法创建附件目录');}
            var indexes=[];for(i=0;i<d.artboards.length;i++)indexes.push(i);
            for(i=0;i<a.formats.length;i++){advance();stageFailures=skipped.length;fmt=a.formats[i];var batches=fmt==='pdf'&&a.splitPDF?indexes.length:1;
                for(var b=0;b<batches;b++){
                    if(progress&&!progress.step(step))throw Error('已取消后续打包');
                    try{var action={type:'export',target:'artboards',artboardIndexes:batches===1?indexes:[indexes[b]],format:fmt,folder:output.fsName,namingMode:'name',resolution:a.resolution,scale:a.scale,colorMode:fmt==='png'?'rgb':a.colorMode,quality:100,transparent:true,compression:true,preserveEditability:false};
                        var exported=exportDelivery(d,[],cache,action);for(var k=0;k<(exported.files||[]).length;k++)files.push((a.outputSubfolder?a.outputSubfolder+'/':'')+exported.files[k]);
                        for(k=0;k<exported.skipped.length;k++)skipped.push(exported.skipped[k]);if(exported.status==='failed'&&!exported.skipped.length)skipped.push({objectId:fmt,reason:exported.error?exported.error.message:'附件输出失败'});
                    }catch(exportError){skipped.push({objectId:fmt,reason:fmt.toUpperCase()+'：'+exportError.message});}
                }if(skipped.length===stageFailures)done();
            }
            if(a.report){advance();reportFile=nextOutput(root,'文件规范',a.report);writePackageReport(reportFile,d,a,resources,files,skipped);files.push(decodeURI(reportFile.name));done();}
        }catch(packageError){skipped.push({objectId:'package',reason:String(packageError.message||packageError)});}
        finally{if(copy)try{closeDeliveryDocument(copy);}catch(closeError){skipped.push({objectId:'cleanup',reason:'打包工作副本未关闭'});}app.userInteractionLevel=level;d.activate();}
        result=resultEdit('打包生成 '+files.length+' 个文件'+(skipped.length?'；未完成 '+skipped.length+' 项：'+skipped[0].reason:''),files.length?['file-export']:[],skipped);result.files=files;result.folder=root.fsName;
        if(!files.length){result.status='failed';result.error={code:'EXPORT_FAILED',message:skipped.length?skipped[0].reason:'未生成打包文件'};}
        if(progress){progress.finish(skipped.length,skipped.length>0);result.exportProgress=progress.state;}
        return result;
    }

    var nativeMenuMap={'group':['group',2],'ungroup':['ungroup',1],'mask-create':['makeMask',2],'mask-release':['releaseMask',1],
        'join':['join',2],'outline-stroke':['OffsetPath v22',1],'compound':['compoundPath',1],
        'shape':['Convert to Shape',1],'expand-shape':['Expand Shape',1],
        'pattern-panel':['Adobe Pattern Panel Toggle',0],
        'intertwine':['Partial Rearrange Make',2],'intertwine-release':['Partial Rearrange Release',1],
        'repeat-mirror':['Make Symmetry Repeat',1],'repeat-options':['Repeat Art Options',1,'dialog'],'repeat-grid':['Make Grid Repeat',1],'repeat-radial':['Make Radial Repeat',1],'repeat-release':['Release Repeat Art',1],
        'on-path-tool':['Adobe Constraints Tool',0,'tool'],'on-path-expand':['Expand Objects on Path',1],
        'artboard-tool':['Adobe Crop Tool',0,'tool'],
        'blend':['Path Blend Make',2],'blend-release':['Path Blend Release',1],'blend-expand':['Path Blend Expand',1],
        'envelope':['Make Envelope',2],'envelope-release':['Release Envelope',1],'envelope-expand':['Expand Envelope',1],
        'perspective-tool':['Perspective Selection Tool',0,'tool'],'perspective-grid':['Perspective Grid Tool',0,'tool'],
        'live-paint':['Make Planet X',1],'paint-tool':['Adobe Planar Paintbucket Tool',0,'tool'],'paint-expand':['Expand Planet X',1],
        'mockup-panel':['Adobe Vector Edge Panel',0],
        'trace-panel':['Adobe Vectorize Panel',0],'trace':['Make Image Tracing',1],'trace-expand':['Expand Image Tracing',1],
        'wrap':['Make Text Wrap',1],'unwrap':['Release Text Wrap',1],
        'same-fill':['Find Fill Color menu item',1],'same-stroke':['Find Stroke Color menu item',1],'same-weight':['Find Stroke Weight menu item',1],'same-opacity':['Find Opacity menu item',1],
        'paragraph-panel':['internal palettes posing as plug-in menus-paragraph',0,'panel'],
        'same-font':['Find Text Font Family menu item',1],'same-font-style':['Find Text Font Family Style menu item',1],'same-size':['Find Text Font Size menu item',1]
    };
    // Filled only after actual command checks on Illustrator 30.0.0.
    var verifiedNativeCommands=['mask-create','mask-release','group','ungroup','paragraph-panel','repeat-mirror','repeat-options','outline-stroke','compound','intertwine','intertwine-release','repeat-grid','repeat-radial','repeat-release','blend','on-path-tool','perspective-tool','perspective-grid','paint-tool','artboard-tool','pattern-panel','mockup-panel','trace-panel','trace','same-fill','same-stroke','same-weight','same-opacity','same-font','same-font-style','same-size'];
    function runNative(d,refs,a){
        if(String(app.version)!=='30.0.0'){throw Error('此 Illustrator 版本的原生快捷命令尚未验证');}
        var allowed=false;for(var i=0;i<verifiedNativeCommands.length;i++){if(a.command===verifiedNativeCommands[i]){allowed=true;}}
        var cmd=nativeMenuMap[a.command];if(!allowed||!cmd){throw Error('此原生命令尚未验证');}
        if(refs.length<cmd[1]){throw Error('此操作至少需要 '+cmd[1]+' 个所选对象');}
        if(a.command==='mask-create'||a.command==='mask-release'){
            if(a.command==='mask-create'){
                var parent=refs[0].item.parent,top=null,peers=parent.pageItems,peerCount=peers.length;
                for(i=0;i<refs.length;i++)if(refs[i].item.parent!==parent)throw Error('创建剪贴蒙版请选取同一父级中的对象');
                for(var pi=0;pi<peerCount&&!top;pi++)for(var ri=0;ri<refs.length;ri++)if(peers[pi]===refs[ri].item){top=peers[pi];break;}
                if(!top||!(/^(PathItem|CompoundPathItem)$/.test(top.typename)))throw Error('请将路径或复合路径置于所选对象最上方作为蒙版');
            }else{var releasedIds=[];for(i=0;i<refs.length;i++){if(refs[i].item.typename!=='GroupItem'||!refs[i].item.clipped)throw Error('请直接选择完整剪贴蒙版群组');releasedIds.push(String(refs[i].item.uuid));}}
            geometryUndo=null;
            try{app.executeMenuCommand(cmd[0]);app.redraw();
                if(a.command==='mask-create'){if(!d.selection||d.selection.length!==1||d.selection[0].typename!=='GroupItem'||!d.selection[0].clipped)throw Error('未确认剪贴蒙版建立');}
                // Removed GroupItem proxies may still report clipped=true until the
                // script returns. Verify fresh selection, not detached old wrappers.
                else{if(!d.selection||!d.selection.length)throw Error('释放后未返回内容选区');for(var rs=0;rs<d.selection.length;rs++){var current=d.selection[rs];if(current.typename==='GroupItem'&&current.clipped)for(i=0;i<releasedIds.length;i++)if(String(current.uuid)===releasedIds[i])throw Error('蒙版仍未释放');}}
            }catch(maskError){return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:'蒙版操作未完整确认，请检查并按需撤销：'+String(maskError)}};}
            return resultEdit(a.command==='mask-create'?'已创建剪贴蒙版':'已释放剪贴蒙版，内容与蒙版路径保留',['native-command']);
        }
        if(a.command==='trace'&&(refs.length!==1||(refs[0].item.typename!=='RasterItem'&&refs[0].item.typename!=='PlacedItem'))){throw Error('请选择一个图片对象');}
        if(a.command==='wrap'){
            for(i=0;i<d.textFrames.length;i++){var text=d.textFrames[i];if(text.kind===TextType.AREATEXT&&!limits(text).hidden){var included=false;for(var j=0;j<refs.length;j++){if(refs[j].item===text){included=true;}}if(!included){throw Error('请一并选择会受绕排影响的区域文字框；不会修改未选中的文字');}}}
        }
        geometryUndo=null;
        if(cmd[2]==='panel'){app.executeMenuCommand(cmd[0]);return resultEdit('已切换 Illustrator 原生段落面板；列表、制表符及中文排版使用原生完整选项',['native-panel']);}
        if(cmd[2]==='tool'){if(app.selectTool(cmd[0])===false){throw Error('无法切换原生工具');}return resultEdit('已切换原生工具，请在画布操作',['native-tool']);}
        app.redraw();app.executeMenuCommand(cmd[0]);app.redraw();if(cmd[2]==='dialog'){return resultEdit('已关闭原生选项窗口，设置以原生窗口为准',['native-dialog']);}if(a.command==='repeat-mirror'){return resultEdit('已创建镜像重复，可在画布拖动对称轴',['native-command']);}return resultEdit(cmd[1]?'已执行原生命令':'已打开原生面板',[a.command.indexOf('same-')===0?'selection':'native-command']);
    }
    // Editable paragraph prefixes; never replace a complete frame or flatten mixed runs.
    function paragraphList(d,cache,refs,a){
        if(a.mode!=='bullet'&&a.mode!=='number'&&a.mode!=='clear')throw Error('段落标记无效');
        var range=selectedTextRange(d),ranges=[],plans=[],stories=[],i,j,changed=0;
        if(range){if(!range.length)throw Error('请选择要设置的段落');if(cache.textKey!==textSelectionStamp(d))throw Error('文字选区已改变');ranges.push(range);}
        else{if(!refs.length)throw Error('请选择文字');for(i=0;i<refs.length;i++){if(refs[i].item.typename!=='TextFrame')throw Error('段落标记只处理所选文字');ranges.push(refs[i].item.textRange);}}
        for(i=0;i<ranges.length;i++){var number=1;for(j=0;j<ranges[i].paragraphs.length;j++){var p=ranges[i].paragraphs[j],start=p.start,story=p.story,duplicate=false;for(var k=0;k<plans.length;k++)if(plans[k].story===story&&plans[k].start===start)duplicate=true;if(duplicate)continue;
            if(plans.length>=1000)throw Error('一次最多处理 1000 段');var head='';for(k=0;k<Math.min(p.length,16);k++){var ch=p.characters[k].contents;if(ch==='\r'||ch==='\n')break;head+=ch;if(ch==='\t')break;}var match=/^(?:•|\d+\.)\t/.exec(head);var prefix='';if(a.mode==='bullet'){prefix='•\t';}else if(a.mode==='number'){prefix=String(number++)+'.\t';}var storyIndex=-1;for(k=0;k<stories.length;k++)if(stories[k]===story)storyIndex=k;if(storyIndex<0){storyIndex=stories.length;stories.push(story);}plans.push({story:story,storyIndex:storyIndex,start:start,remove:match?match[0].length:0,prefix:prefix});}}
        plans.sort(function(x,y){return x.storyIndex-y.storyIndex||x.start-y.start;});var counter=0,priorStory=-1;for(i=0;i<plans.length;i++){if(plans[i].storyIndex!==priorStory){counter=0;priorStory=plans[i].storyIndex;}if(a.mode==='number')plans[i].prefix=String(++counter)+'.\t';}
        try{for(i=plans.length-1;i>=0;i--){var plan=plans[i],r=plan.story.textRange;if(plan.remove){var old=r.characters[plan.start];old.length=plan.remove;old.contents='';changed++;}if(plan.prefix){r.insertionPoints[plan.start].characters.add(plan.prefix);changed++;var inserted=plan.story.textRange.characters[plan.start];inserted.length=plan.prefix.length;if(inserted.contents!==plan.prefix)throw Error('行首标记未生效');}}app.redraw();geometryUndo=null;return resultEdit('已设置可编辑段落标记',changed?['text-list']:[]);}
        catch(error){return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:changed?['partial-write']:[],error:{code:'HOST_SCRIPT_ERROR',message:'段落标记未全部完成：'+String(error)}};}
    }
    function textCase(d,cache,a){
        var keys={upper:'UpperCase Change Case Item',lower:'LowerCase Change Case Item',title:'Title Case Change Case Item',sentence:'Sentence case Change Case Item'};
        if(!keys[a.mode]){throw Error('未知大小写方式');}
        var range=selectedTextRange(d);
        if(range){if(!range.length){throw Error('请选择字符，不处理空插入点');}if(!cache.textKey||cache.textKey!==textSelectionStamp(d)){throw Error('文字选区已改变，请重新读取');}}
        else {if(!cache.refs.length){throw Error('请选择文字');}for(var i=0;i<cache.refs.length;i++){if(cache.refs[i].item.typename!=='TextFrame'){throw Error('大小写转换只处理所选文字，选区包含其他对象');}}}
        app.executeMenuCommand(keys[a.mode]);app.redraw();geometryUndo=null;return resultEdit('已转换所选文字大小写',['text-case']);
    }
    function textSelectionStamp(d){var r=selectedTextRange(d);if(!r){return '';}return String(r.start)+'|'+r.length+'|'+r.contents;}
    function renameBoards(d,cache,a){
        if(boardStamp(d)!==cache.artboards){throw Error('画板已改变，请刷新');}if(!(a.names instanceof Array)||!a.names.length){throw Error('请选择画板');}
        var old=[],seen={},i;for(i=0;i<a.names.length;i++){var n=a.names[i];if(typeof n.index!=='number'||n.index%1||n.index<0||n.index>=d.artboards.length||seen[n.index]||typeof n.name!=='string'||!n.name.replace(/\s/g,'')||n.name.length>240||/[\x00-\x1f]/.test(n.name)){throw Error('画板名称或编号无效');}seen[n.index]=true;old.push(d.artboards[n.index].name);}
        try{for(i=0;i<a.names.length;i++){d.artboards[a.names[i].index].name=a.names[i].name;}}
        catch(e){for(var j=0;j<i;j++){d.artboards[a.names[j].index].name=old[j];}throw e;}
        return resultEdit('已重命名 '+a.names.length+' 个画板',['artboard-names']);
    }

    function exportEditor(d,sid,a){
        if(!/^(png|jpeg|svg|pdf|ai|eps|tif|psd)$/.test(a.format)){throw Error('不支持的导出格式');}
        var dpi=a.resolution===undefined?72*a.scale/100:a.resolution;
        if(!isFinite(dpi)||dpi<1||dpi>2400){throw Error('分辨率范围为 1–2400 ppi');}
        var quality=a.quality===undefined?100:a.quality;if(!isFinite(quality)||quality<0||quality>100){throw Error('JPEG 品质范围为 0–100');}
        var folder;if(a.sourceFolder){try{folder=d.fullName.parent;}catch(noSource){throw Error('文档尚未保存，请先保存或选择项目目录');}}else{if(!a.folder){throw Error('请先设置项目导出目录');}folder=new Folder(a.folder);}
        if(!folder.exists){throw Error('项目目录不存在，请重新选择');}
        var boardCount=d.artboards.length,originalAB=d.artboards.getActiveArtboardIndex(),interaction=app.userInteractionLevel,count=0,copyDoc=null,files=[];
        function fileFor(base,ext){var file=new File(folder.fsName+'/'+base+'.'+ext),n=1;function exists(f){if(f.exists){return true;}if(ext!=='svg'&&ext!=='eps'){return false;}var list=folder.getFiles('*.'+ext),stem=decodeURI(f.name).replace(/\.[^.]*$/,'');for(var z=0;z<list.length;z++){if(decodeURI(list[z].name).indexOf(stem)===0){return true;}}return false;}while(exists(file)){file=new File(folder.fsName+'/'+base+'-'+(n++)+'.'+ext);}return file;}
        function normalizeOutput(file,ext){if(file.exists&&file.length){return;}var stem=decodeURI(file.name).replace(/\.[^.]*$/,''),list=folder.getFiles('*.'+ext),found=[];for(var n=0;n<list.length;n++){if(decodeURI(list[n].name).indexOf(stem)===0){found.push(list[n]);}}if(found.length!==1||!found[0].length){throw Error('没有找到唯一有效的 '+ext+' 输出');}if(!found[0].rename(decodeURI(file.name))){throw Error('输出已生成，但文件名整理失败');}}
        function cloneLayer(source,parent){var layer=parent.layers.add();layer.name=source.name;layer.opacity=source.opacity;layer.blendingMode=source.blendingMode;
            // Native duplication retains nested groups, compound paths, live text and clipping structure.
            for(var j=0;j<source.pageItems.length;j++){if(source.pageItems[j].parent===source){source.pageItems[j].duplicate(layer,ElementPlacement.PLACEATEND);}}
            for(var k=source.layers.length-1;k>=0;k--){cloneLayer(source.layers[k],layer);}layer.visible=source.visible;layer.locked=source.locked;return layer;}
        try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
            var vector=/^(pdf|ai|eps)$/.test(a.format),base=d.name.replace(/\.[^.]*$/,'').replace(/[\\\/:*?"<>|]/g,'_');
            if(vector){
                var rect=d.artboards[0].artboardRect;copyDoc=app.documents.add(d.documentColorSpace,rect[2]-rect[0],rect[1]-rect[3]);copyDoc.artboards[0].artboardRect=rect;copyDoc.artboards[0].name=d.artboards[0].name;
                for(var ab=1;ab<d.artboards.length;ab++){copyDoc.artboards.add(d.artboards[ab].artboardRect).name=d.artboards[ab].name;}
                for(var li=d.layers.length-1;li>=0;li--){cloneLayer(d.layers[li],copyDoc);}
                copyDoc.rasterEffectSettings.resolution=dpi;
                if(a.format!=='eps'){
                    if(!a.allArtboards){for(var rm=copyDoc.artboards.length-1;rm>=0;rm--){if(rm!==originalAB){copyDoc.artboards[rm].remove();}}}
                    var vf=fileFor(base+(a.allArtboards?'':'-'+(originalAB+1)),a.format),vo;
                    if(a.format==='pdf'){vo=new PDFSaveOptions();vo.preserveEditability=a.preserveEditability!==false;vo.artboardRange='';vo.colorDownsampling=dpi;vo.grayscaleDownsampling=dpi;}
                    else{vo=new IllustratorSaveOptions();vo.pdfCompatible=a.pdfCompatible!==false;vo.compressed=true;vo.embedLinkedFiles=a.embedImages===true;}
                    copyDoc.saveAs(vf,vo);if(!vf.exists||vf.length===0){throw Error('未生成有效输出文件');}files.push(vf);count++;
                }else{
                    var ef=fileFor(base,'eps'),eo=new EPSSaveOptions();eo.saveMultipleArtboards=true;eo.artboardRange=a.allArtboards?'':String(originalAB+1);eo.embedLinkedFiles=a.embedImages===true;eo.includeDocumentThumbnails=true;
                    // Illustrator narrows a document after EPS saveAs. Export all requested boards in one call.
                    var epsStem=decodeURI(ef.name).replace(/\.eps$/i,'');copyDoc.saveAs(ef,eo);var epsFiles=folder.getFiles('*.eps');
                    for(var en=0;en<epsFiles.length;en++){if(decodeURI(epsFiles[en].name).indexOf(epsStem)===0&&epsFiles[en].length){files.push(epsFiles[en]);count++;}}
                    if(count!==(a.allArtboards?boardCount:1)){throw Error('EPS 实际文件数量与画板数量不一致');}
                }
            }else{for(var i=0;i<d.artboards.length;i++){if(!a.allArtboards&&i!==originalAB){continue;}d.artboards.setActiveArtboardIndex(i);var out=fileFor(base+'-'+(i+1),a.format==='jpeg'?'jpg':a.format),opts,fmt;
                if(a.format==='png'){opts=new ExportOptionsPNG24();opts.artBoardClipping=true;opts.transparency=a.transparent!==false;opts.horizontalScale=dpi/72*100;opts.verticalScale=dpi/72*100;fmt=ExportType.PNG24;}
                else if(a.format==='jpeg'){opts=new ExportOptionsJPEG();opts.artBoardClipping=true;opts.qualitySetting=quality;opts.horizontalScale=dpi/72*100;opts.verticalScale=dpi/72*100;fmt=ExportType.JPEG;}
                else{opts=new ExportOptionsSVG();opts.saveMultipleArtboards=true;opts.artboardRange=String(i+1);fmt=ExportType.SVG;}
                d.exportFile(out,fmt,opts);if(a.format==='svg'){normalizeOutput(out,'svg');}if(a.format!=='svg'&&(!out.exists||!out.length)){throw Error('未生成有效输出文件');}files.push(out);count++;
            }}return resultEdit('已导出 '+count+' 个文件；同名文件自动编号',['file-export']);
        }catch(ex){var result=failed('EXPORT_FAILED','导出失败：'+String(ex.message||ex)+(count?'；已完成 '+count+' 个文件':''));if(count){result.sideEffects=['partial-file-export'];}return result;}
        finally{if(copyDoc){copyDoc.close(SaveOptions.DONOTSAVECHANGES);}app.userInteractionLevel=interaction;d.activate();d.artboards.setActiveArtboardIndex(originalAB);}
    }

    var fontListCache=null,textSearchCache=null;
    function listEditorFonts(){if(!fontListCache){fontListCache=[];for(var i=0;i<app.textFonts.length;i++){var f=app.textFonts[i];fontListCache.push({name:f.name,family:f.family,style:f.style});}}var result=resultEdit('已读取 Illustrator 字体库');result.fonts=fontListCache;return result;}
    function textFramesIn(items){var found=[];function add(item){var lim=limits(item);if(lim.hidden||lim.locked){return;}if(item.typename==='TextFrame'){for(var k=0;k<found.length;k++){if(found[k]===item){return;}}found.push(item);}else if(item.typename==='GroupItem'){for(var j=0;j<item.pageItems.length;j++){if(item.pageItems[j].parent===item){add(item.pageItems[j]);}}}}for(var i=0;i<items.length;i++){add(items[i]);}return found;}
    function numberSetting(value,min,max,label){if(typeof value!=='number'||!isFinite(value)||value<min||value>max){throw Error(label+'超出范围 '+min+'–'+max);}return value;}
    function textValueEqual(a,b){if(b&&b.typename==='TextFont')return a&&a.name===b.name;if(typeof b==='number')return typeof a==='number'&&Math.abs(a-b)<0.0001;return String(a)===String(b);}
    // Illustrator can ignore writes equal to inherited defaults. A temporary LOCAL
    // style changes inheritance only for the requested range; existing styles are
    // reapplied without clearing overrides and never modified globally.
    function setCharacterValue(d,r,key,value){
        r.characterAttributes[key]=value;try{if(textValueEqual(r.characterAttributes[key],value))return;}catch(mixed){}
        var temp=d.characterStyles.add('AIQ 临时字符 '+(++serial)),alternative=value;
        if(key==='textFont'){for(var fi=0;fi<r.characters.length;fi++){alternative=r.characters[fi].characterAttributes.textFont;if(alternative.name!==value.name)break;}}
        else if(key==='baselinePosition'){alternative=FontBaselineOption.SUBSCRIPT;if(value===alternative)alternative=FontBaselineOption.SUPERSCRIPT;}
        else if(typeof value==='boolean'){alternative=!value;}else if(typeof value==='number'){alternative=value+0.01;if(value>=1296)alternative=value-0.01;}else{temp.remove();throw Error('字体未能应用，请使用原生字体菜单');}
        try{temp.characterAttributes[key]=alternative;for(var ci=0;ci<r.characters.length;ci++){var cr=r.characters[ci];try{if(textValueEqual(cr.characterAttributes[key],value))continue;}catch(unreadable){}var original=cr.characterStyles[0];try{temp.applyTo(cr,false);cr.characterAttributes[key]=value;}finally{original.applyTo(cr,false);}if(!textValueEqual(cr.characterAttributes[key],value))throw Error('字符设置未生效：'+key);}}
        finally{temp.remove();}
    }
    function setParagraphValue(d,r,key,value){
        r.paragraphAttributes[key]=value;try{if(textValueEqual(r.paragraphAttributes[key],value))return;}catch(mixed){}
        var original=r.paragraphStyles[0],temp=d.paragraphStyles.add('AIQ 临时段落 '+(++serial)),alternative=value;
        if(key==='justification'){alternative=Justification.CENTER;if(value===alternative)alternative=Justification.LEFT;}
        else if(typeof value==='boolean'){alternative=!value;}else if(typeof value==='number'){alternative=value+0.01;}
        try{temp.paragraphAttributes[key]=alternative;try{temp.applyTo(r,false);r.paragraphAttributes[key]=value;}finally{original.applyTo(r,false);}if(!textValueEqual(r.paragraphAttributes[key],value))throw Error('段落设置未生效：'+key);}
        finally{temp.remove();}
    }
    function formatText(d,cache,refs,a){
        var c=a.character||{},p=a.paragraph||{},ranges=[],frames=[],i,j,key,range=selectedTextRange(d);
        var cLimits={fontSize:[0.1,1296],leading:[0.1,1296],tracking:[-1000,10000],baselineShift:[-1296,1296],horizontalScale:[1,1000],verticalScale:[1,1000],opacity:[0,100]},pLimits={leftIndent:[-1296,1296],rightIndent:[-1296,1296],firstLineIndent:[-1296,1296],spaceBefore:[0,1296],spaceAfter:[0,1296],autoLeadingAmount:[0,500],minimumWordSpacing:[0,1000],desiredWordSpacing:[0,1000],maximumWordSpacing:[0,1000],minimumLetterSpacing:[-100,500],desiredLetterSpacing:[-100,500],maximumLetterSpacing:[-100,500],minimumGlyphScaling:[50,200],desiredGlyphScaling:[50,200],maximumGlyphScaling:[50,200]};
        for(key in c){if(cLimits[key]){numberSetting(c[key],cLimits[key][0],cLimits[key][1],key);}else if(key!=='font'&&key!=='baseline'&&key!=='autoLeading'){throw Error('未知字符属性');}}
        for(key in p){if(pLimits[key]){numberSetting(p[key],pLimits[key][0],pLimits[key][1],key);}else if(key!=='justification'&&key!=='hyphenation'&&key!=='everyLineComposer'){throw Error('未知段落属性');}}
        var font=null;if(c.font){try{font=app.textFonts.getByName(c.font);}catch(noFont){throw Error('字体不可用，请更新字体库');}}
        var align={left:Justification.LEFT,center:Justification.CENTER,right:Justification.RIGHT,'full-left':Justification.FULLJUSTIFYLASTLINELEFT,'full-center':Justification.FULLJUSTIFYLASTLINECENTER,'full-right':Justification.FULLJUSTIFYLASTLINERIGHT,full:Justification.FULLJUSTIFY};
        if(p.justification&&align[p.justification]===undefined){throw Error('未知段落对齐');}if(c.baseline&&c.baseline!=='normal'&&c.baseline!=='super'&&c.baseline!=='sub'){throw Error('未知上标下标设置');}
        if(range){if(!range.length||cache.textKey!==textSelectionStamp(d)){throw Error('请选择有效文字范围');}if(c.opacity!==undefined){throw Error('不透明度属于对象属性，请选择整个文字框后设置');}ranges.push(range);}
        else{var items=[];for(i=0;i<refs.length;i++){items.push(refs[i].item);}frames=textFramesIn(items);for(i=0;i<frames.length;i++){ranges.push(frames[i].textRange);}}
        if(!ranges.length){throw Error('请选择可编辑文字或包含文字的群组');}
        // Validate spacing relationships against each affected paragraph before any writes.
        for(i=0;i<ranges.length;i++){for(j=0;j<ranges[i].paragraphs.length;j++){var old=ranges[i].paragraphs[j].paragraphAttributes;var types=['WordSpacing','LetterSpacing','GlyphScaling'];for(var z=0;z<types.length;z++){var t=types[z],lo=p['minimum'+t]!==undefined?p['minimum'+t]:old['minimum'+t],mid=p['desired'+t]!==undefined?p['desired'+t]:old['desired'+t],hi=p['maximum'+t]!==undefined?p['maximum'+t]:old['maximum'+t];if(lo>mid||mid>hi){throw Error(t+'须满足最小值 ≤ 理想值 ≤ 最大值');}}}}
        var count=0;try{for(i=0;i<ranges.length;i++){var ca=ranges[i].characterAttributes;if(font){setCharacterValue(d,ranges[i],'textFont',font);}for(key in c){if(key==='opacity'||key==='font'){continue;}var property=key,value=c[key];if(key==='fontSize'){property='size';}else if(key==='baseline'){property='baselinePosition';value=FontBaselineOption.NORMALBASELINE;if(c[key]==='super'){value=FontBaselineOption.SUPERSCRIPT;}else if(c[key]==='sub'){value=FontBaselineOption.SUBSCRIPT;}}if(key==='leading'){setCharacterValue(d,ranges[i],'autoLeading',false);}setCharacterValue(d,ranges[i],property,value);count++;}
            for(j=0;j<ranges[i].paragraphs.length;j++){for(key in p){var desired=p[key];if(key==='justification')desired=align[p[key]];setParagraphValue(d,ranges[i].paragraphs[j],key,desired);count++;}}}
            if(c.opacity!==undefined){for(i=0;i<frames.length;i++){frames[i].opacity=c.opacity;count++;}}}
        catch(formatError){return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:'文字设置部分失败，请检查：'+formatError.message}};}
        app.redraw();return resultEdit('已应用所选文字与段落设置',count||font?['text-format']:[]);
    }
    var objectTextSearch=null;
    function sampleSelectedText(d,criteria){
        var range=selectedTextRange(d);if(!range||!range.length)throw Error('请用文字工具选中一个字或同样式文字');
        if(range.length>1000)throw Error('取样最多 1000 个字符，请缩小文字选区');
        var values={},chars=range.characters,n=chars.length;
        for(var i=0;i<n;i++){var ca=chars[i].characterAttributes;
            for(var j=0;j<criteria.length;j++){var k=criteria[j],v;
                if(k==='font')v=ca.textFont.name;else if(k==='fontSize')v=ca.size;else if(k==='fill')v=color(ca.fillColor).colorId;else if(k==='stroke')v=color(ca.strokeColor).colorId;else if(k==='strokeWidth')v=ca.strokeWeight;else throw Error('局部文字支持字体、字号、填色、描边和线宽；对象大小/类型请使用整个对象取样');
                if(String(v).indexOf('unknown')===0)throw Error('所选字符样式不可解析');if(i&&values[k]!==v)throw Error('所选字符的取样属性混合，请缩小至同样式文字');values[k]=v;
            }
        }if(values.font)values.fontStyle=chars[0].characterAttributes.textFont.style;return values;
    }
    var objectSearchCache=null;
    function finderCompare(n,value,mode,tolerance){if(mode==='greater')return n>value+tolerance;if(mode==='less')return n<value-tolerance;return Math.abs(n-value)<=tolerance;}
    function finderScope(a,d){if(a.scope!=='document'&&a.scope!=='selection'&&a.scope!=='artboard'&&a.scope!=='layer')throw Error('未知查找范围');if(a.scope==='artboard')return d.artboards.getActiveArtboardIndex();if(a.scope==='layer')return d.activeLayer;return null;}
    function finderIndexes(stored,a){var wanted=a.matchIndexes,indexes=[],seen={},i,n;if(wanted===undefined){for(i=0;i<stored.hits.length;i++)indexes.push(i);return indexes;}if(!(wanted instanceof Array)||!wanted.length)throw Error('请选择匹配项');for(i=0;i<wanted.length;i++){n=wanted[i];if(typeof n!=='number'||n%1||n<0||n>=stored.hits.length||seen[n])throw Error('匹配编号已失效');seen[n]=true;indexes.push(n);}return indexes;}
    function finderCenter(d,item){var b=item.geometricBounds;d.views[0].centerPoint=[(b[0]+b[2])/2,(b[1]+b[3])/2];}
    function objectSearchStyle(item,criteria){
        var out={},i,key,p=item,ca=null;
        if(item.typename==='CompoundPathItem'){if(!item.pathItems.length)return null;p=item.pathItems[0];}
        for(i=0;i<criteria.length;i++){key=criteria[i];if(key==='size'||key==='kind')continue;
            if(item.typename==='TextFrame'){
                var uniform=null;for(var c=0;c<item.characters.length;c++){ca=item.characters[c].characterAttributes;var v;if(key==='font')v=ca.textFont.name;else if(key==='fontSize')v=ca.size;else if(key==='strokeWidth')v=ca.strokeWeight;else v=color(key==='fill'?ca.fillColor:ca.strokeColor).colorId;if(c===0)uniform=v;else if(uniform!==v)return null;}if(uniform===null)return null;out[key]=uniform;
            }else if(p.typename==='PathItem'&&key!=='font'&&key!=='fontSize'){
                if(key==='strokeWidth')out[key]=p.stroked?p.strokeWidth:0;else if(key==='fill')out[key]=p.filled?color(p.fillColor).colorId:'none';else out[key]=p.stroked?color(p.strokeColor).colorId:'none';
                if(item.typename==='CompoundPathItem'){for(var q=1;q<item.pathItems.length;q++){var sibling=objectSearchStyle(item.pathItems[q],[key]);if(!sibling||sibling[key]!==out[key])return null;}}
            }else return null;
            if(String(out[key]).indexOf('unknown')>=0)return null;
        }return out;
    }
    function searchEditorObjects(d,sid,a){
        var context=finderScope(a,d),same=a.same||[],allowed={fill:1,stroke:1,strokeWidth:1,kind:1,size:1,font:1,fontSize:1},i,j,result,hits=[],visited={},count=0,skipped=0;
        if(!(same instanceof Array))throw Error('筛选条件无效');for(i=0;i<same.length;i++)if(!allowed[same[i]])throw Error('未知筛选条件');
        numberSetting(a.tolerance,0,10000,'容差');if(a.width!==undefined)numberSetting(a.width,0.01,1000000,'宽度');if(a.height!==undefined)numberSetting(a.height,0.01,1000000,'高度');
        if(!/^(equal|greater|less)$/.test(a.sizeCompare))throw Error('尺寸比较无效');
        var key=stringify([a.scope,same,a.excludeGroups,a.tolerance,a.width,a.height,a.sizeCompare,a.name||'']);
        if(a.operation!=='find'&&objectTextSearch&&objectTextSearch.sid===sid&&objectTextSearch.token===a.searchToken){
            if(objectTextSearch.key!==key)throw Error('筛选条件已变化，请重新查找');var textAction=objectTextSearch.action;textAction.operation=a.operation;textAction.searchToken=a.searchToken;textAction.matchIndexes=a.matchIndexes;
            var textResult=searchEditorText(d,sid,null,textAction);textResult.matchKind='text';return textResult;
        }
        if(a.operation==='find'&&selectedTextRange(d)&&same.length){
            if(a.width!==undefined||a.height!==undefined||a.name)throw Error('局部文字取样不支持对象尺寸/名称筛选');
            var sample=sampleSelectedText(d,same),sampleAction={query:'',scope:a.scope,operation:'find',sizeCompare:'equal'};
            for(var prop in sample)if(sample.hasOwnProperty(prop))sampleAction[prop]=sample[prop];
            var sampled=searchEditorText(d,sid,null,sampleAction);sampled.matchKind='text';objectTextSearch={sid:sid,key:key,token:sampled.searchToken,action:sampleAction};return sampled;
        }
        if(a.operation==='find'){
            objectTextSearch=null;objectSearchCache=null;var source=null,sourceStyle=null,sourceBounds=null,selection=selectedItems(d);
            if(same.length){if(selectedTextRange(d)||selection.length!==1)throw Error('选择相同条件时，请先选中一个参考对象');source=selection[0];sourceStyle=objectSearchStyle(source,same);sourceBounds=editorBounds(source);if(!sourceStyle)throw Error('参考对象含混合或未解析样式，请选择单一样式对象');}
            var board=a.scope==='artboard'?bounds(d.artboards[context].artboardRect):null;
            function visit(item){
                var id=String(item.uuid);if(visited[id])return;visited[id]=true;if(++count>20000)throw Error('超过 20000 个对象，请缩小范围');var lim=limits(item);if(lim.hidden||lim.locked){skipped++;return;}
                var b=editorBounds(item),accept=!(a.excludeGroups&&item.typename==='GroupItem'),k;
                if(variableMask(item))accept=false;
                if(board&&(b[2]<=board[0]||b[0]>=board[2]||b[3]<=board[1]||b[1]>=board[3]))accept=false;
                if(a.scope==='layer'&&item.layer!==context)accept=false;
                if(a.name&&String(item.name).indexOf(a.name)<0)accept=false;
                if(a.width!==undefined&&!finderCompare(b[2]-b[0],a.width,a.sizeCompare,a.tolerance))accept=false;
                if(a.height!==undefined&&!finderCompare(b[3]-b[1],a.height,a.sizeCompare,a.tolerance))accept=false;
                if(accept&&same.length){var style=objectSearchStyle(item,same);if(!style)accept=false;else for(k=0;k<same.length;k++){var criterion=same[k];if(criterion==='kind'){if(kind(item)!==kind(source))accept=false;}else if(criterion==='size'){if(!finderCompare(b[2]-b[0],sourceBounds[2]-sourceBounds[0],a.sizeCompare,a.tolerance)||!finderCompare(b[3]-b[1],sourceBounds[3]-sourceBounds[1],a.sizeCompare,a.tolerance))accept=false;}else if(typeof style[criterion]==='number'){if(!finderCompare(style[criterion],sourceStyle[criterion],'equal',criterion==='fontSize'?0.01:a.tolerance))accept=false;}else if(style[criterion]!==sourceStyle[criterion])accept=false;}}
                if(accept){hits.push({item:item,parent:item.parent,stamp:displayStamp(item),style:objectSearchStyle(item,same),name:String(item.name),preview:(item.name||kind(item))+' · '+Number((b[2]-b[0]).toFixed(2))+' × '+Number((b[3]-b[1]).toFixed(2))+' pt'});if(hits.length>10000)throw Error('匹配超过 10000 个，请缩小范围');}
                if(item.typename==='GroupItem'){var children=item.pageItems;for(var c=0,childCount=children.length;c<childCount;c++){var child=children[c];if(child.parent===item)visit(child);}}
            }
            if(a.scope==='selection'){if(selectedTextRange(d)||!selection.length)throw Error('请先选择对象或群组，空选区不会扩大范围');for(i=0;i<selection.length;i++)visit(selection[i]);}
            else {var allItems=d.pageItems,allCount=allItems.length;if(a.scope==='document'&&allCount>20000)throw Error('超过 20000 个对象，请缩小范围');for(i=0;i<allCount;i++)visit(allItems[i]);}
            objectSearchCache={sid:sid,key:key,context:context,token:sid+':objects-'+(++serial),hits:hits};result=resultEdit('匹配 '+hits.length+' 个对象；跳过隐藏或锁定 '+skipped+' 项');result.matchCount=hits.length;result.searchToken=objectSearchCache.token;result.matches=[];for(i=0;i<hits.length;i++)result.matches.push({index:i,preview:hits[i].preview,count:1});return result;
        }
        var stored=objectSearchCache;if(!stored||stored.sid!==sid||stored.token!==a.searchToken||stored.key!==key||stored.context!==context)throw Error('筛选条件或范围已变化，请重新查找');
        var indexes=finderIndexes(stored,a);for(i=0;i<indexes.length;i++){var hit=stored.hits[indexes[i]],l=limits(hit.item);if(l.hidden||l.locked||hit.item.parent!==hit.parent||String(hit.item.name)!==hit.name||displayStamp(hit.item)!==hit.stamp||stringify(objectSearchStyle(hit.item,same))!==stringify(hit.style))throw Error('对象或样式已变化，请重新查找');hits.push(hit);}
        if(!hits.length)throw Error('没有匹配项');if(a.operation!=='select'&&a.operation!=='locate')throw Error('未知查找操作');if(a.operation==='locate'&&hits.length!==1)throw Error('定位只接受一个结果');
        d.selection=null;for(i=0;i<hits.length;i++)hits[i].item.selected=true;if(a.operation==='locate')finderCenter(d,hits[0].item);app.redraw();return resultEdit('已选择 '+hits.length+' 个匹配对象',['selection']);
    }
    // Text style fills retain their native color model, including spot base and tint.
    // Other color consumers keep the legacy color() contract.
    function textFillValue(c){
        if(!c)throw Error('文字填色不可读取');
        if(c.typename==='NoColor')return {kind:'none'};
        if(c.typename==='RGBColor')return {kind:'rgb',values:[c.red,c.green,c.blue]};
        if(c.typename==='CMYKColor')return {kind:'cmyk',values:[c.cyan,c.magenta,c.yellow,c.black]};
        if(c.typename==='GrayColor')return {kind:'gray',values:[c.gray]};
        if(c.typename==='SpotColor'){var base=textFillValue(c.spot.color);if(base.kind==='spot'||base.kind==='none')throw Error('专色基色不可解析');return {kind:'spot',name:String(c.spot.name),tint:c.tint,base:base};}
        throw Error('文字填色暂不支持渐变、图案或未解析颜色');
    }
    function textFillKey(v){
        if(!v||typeof v!=='object')throw Error('文字填色条件无效');
        if(v.kind==='none')return 'none';
        if(v.kind==='spot'){if(typeof v.name!=='string'||!v.name||!v.base||v.base.kind==='spot'||v.base.kind==='none')throw Error('专色填色条件无效');numberSetting(v.tint,0,100,'专色色调');return stringify(['spot',v.name,v.tint,textFillKey(v.base)]);}
        var lengths={rgb:3,cmyk:4,gray:1},n=lengths[v.kind],max=v.kind==='rgb'?255:100;if(!n||!(v.values instanceof Array)||v.values.length!==n)throw Error('文字填色仅支持 RGB、CMYK、灰度、专色或无填色');
        for(var i=0;i<n;i++)numberSetting(v.values[i],0,max,'填色通道');return stringify([v.kind,v.values]);
    }
    function textFillNative(d,v){
        textFillKey(v);var c,i;if(v.kind==='none')return new NoColor();
        if(v.kind==='rgb'){c=new RGBColor();c.red=v.values[0];c.green=v.values[1];c.blue=v.values[2];}
        else if(v.kind==='cmyk'){c=new CMYKColor();c.cyan=v.values[0];c.magenta=v.values[1];c.yellow=v.values[2];c.black=v.values[3];}
        else if(v.kind==='gray'){c=new GrayColor();c.gray=v.values[0];}
        else{var found=null;for(i=0;i<d.spots.length;i++)if(String(d.spots[i].name)===v.name){if(found)throw Error('专色身份不唯一，请重新取样');found=d.spots[i];}if(!found||textFillKey(textFillValue(found.color))!==textFillKey(v.base))throw Error('专色已变化或不属于当前文档，请重新取样');c=new SpotColor();c.spot=found;c.tint=v.tint;}return c;
    }
    function sampleEditorTextStyle(d,a){
        var fields=a.fields||['font','fontSize','fill'],range=selectedTextRange(d),out={},keys={},chars,i,j,k,value,key;if(!(fields instanceof Array)||!fields.length)throw Error('请选择取样属性');if(!range||!range.length)throw Error('请用文字工具选中一个字或同样式文字');if(range.length>1000)throw Error('取样最多 1000 个字符，请缩小文字选区');chars=range.characters;
        for(i=0;i<chars.length;i++){var ca=chars[i].characterAttributes;for(j=0;j<fields.length;j++){k=fields[j];if(k==='font'){value=ca.textFont.name;key=String(value);}else if(k==='fontSize'){value=ca.size;numberSetting(value,0.1,1296,'字号');key=String(value);}else if(k==='fill'){value=textFillValue(ca.fillColor);key=textFillKey(value);}else throw Error('未知取样属性');if(i&&keys[k]!==key)throw Error('所选字符的取样属性混合，请缩小选区或仅取样填色');keys[k]=key;out[k]=value;}}
        if(out.font){out.fontFamily=chars[0].characterAttributes.textFont.family;out.fontStyle=chars[0].characterAttributes.textFont.style;}var result=resultEdit('已取样所选字符样式');result.textSample=out;return result;
    }
    function prepareTextStyleReplacement(d,hits,a){
        var changeFont=!!(a.replacementFamily||a.replacementStyle||a.replacementFont),changeSize=a.replacementSize!==undefined,changeFill=a.replacementFill!==undefined,plans=[],resolved={},available=null,fill=null,i,j;
        if(!changeFont&&!changeSize&&!changeFill)throw Error('请至少选择一个替换属性');if(changeSize)numberSetting(a.replacementSize,0.1,1296,'替换字号');if(changeFill)fill=textFillNative(d,a.replacementFill);if(a.replacementFont&&(a.replacementFamily||a.replacementStyle))throw Error('替换字体参数冲突');
        if(changeFont)available=listEditorFonts().fonts;
        for(i=0;i<hits.length;i++){var hit=hits[i];for(j=hit.start;j<hit.end;j++){var r=hit.story.textRange.characters[j],target=null;if(changeFont){if(a.replacementFont){try{target=app.textFonts.getByName(a.replacementFont);}catch(noFont){throw Error('替换字体不可用，请重新加载字体库');}}else{var old=r.characterAttributes.textFont,family=a.replacementFamily||old.family,style=a.replacementStyle||old.style,fontKey=stringify([family,style]);if(resolved[fontKey])target=resolved[fontKey];else{for(var fi=0;fi<available.length;fi++)if(available[fi].family===family&&available[fi].style===style){if(target)throw Error('字体家族与款式不唯一，请选择其他款式');target=app.textFonts.getByName(available[fi].name);}if(!target)throw Error('替换字体缺少所需款式，请同时指定可用款式');resolved[fontKey]=target;}}}plans.push({story:hit.story,start:j,font:target});}}
        return {characters:plans,fill:fill,changeFill:changeFill,changeSize:changeSize};
    }
    function applyTextStyleReplacement(d,hits,a){
        // Preflight every target before the first write; resolve per character to preserve mixed styles.
        var plan=prepareTextStyleReplacement(d,hits,a),done=0;try{for(var i=0;i<plan.characters.length;i++){var p=plan.characters[i],r=p.story.textRange.characters[p.start];r.length=1;if(p.font)setCharacterValue(d,r,'textFont',p.font);if(plan.changeSize)setCharacterValue(d,r,'size',a.replacementSize);if(plan.changeFill){r.characterAttributes.fillColor=plan.fill;if(textFillKey(textFillValue(r.characterAttributes.fillColor))!==textFillKey(a.replacementFill))throw Error('文字填色未生效');}done++;}}
        catch(writeError){textSearchCache=null;return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:'已处理 '+done+' 个字符；样式替换部分失败：'+writeError.message}};}
        textSearchCache=null;app.redraw();return resultEdit('已替换 '+hits.length+' 处匹配的指定样式，其他属性保持原样',['text-replace']);
    }
    function finderTextStyle(range,a){
        var signatures=[],previous='',ok=true,unresolved=false,unresolvedPaint=false,characters=range.characters;
        for(var i=0,n=characters.length;i<n;i++){var ca=characters[i].characterAttributes,f=null,fontName=null;try{f=ca.textFont;fontName=f.name;}catch(unavailableFont){f=null;unresolved=true;}
            var fillKey=null;try{fillKey=textFillKey(textFillValue(ca.fillColor));}catch(unresolvedFill){unresolvedPaint=true;}var sig=stringify([fontName,ca.size,ca.tracking,ca.leading,fillKey||color(ca.fillColor).colorId,color(ca.strokeColor).colorId]);if(sig!==previous){signatures.push(i+':'+sig);previous=sig;}
            if(a.textFill!==undefined&&(!fillKey||fillKey!==textFillKey(a.textFill)))ok=false;
            if(a.fill!==undefined&&color(ca.fillColor).colorId!==a.fill)ok=false;if(a.stroke!==undefined&&color(ca.strokeColor).colorId!==a.stroke)ok=false;if(a.strokeWidth!==undefined&&Math.abs(ca.strokeWeight-a.strokeWidth)>0.001)ok=false;
            if(a.font&&(!f||fontName!==a.font&&f.family!==a.font))ok=false;if(a.fontStyle&&(!f||f.style!==a.fontStyle))ok=false;if(a.fontSize!==undefined&&!finderCompare(ca.size,a.fontSize,a.sizeCompare||'equal',0.01))ok=false;
        }return {ok:ok,stamp:signatures.join('|'),unresolved:unresolved,unresolvedFill:unresolvedPaint};
    }
    function searchEditorText(d,sid,cache,a){
        var query=String(a.query||''),i,j,result,selection=[],hits=[],frames=[],skipped=[],stories=[],context=finderScope(a,d),filtered=!!(a.font||a.fontStyle||a.fontSize!==undefined||a.textFill!==undefined||a.fill!==undefined||a.stroke!==undefined||a.strokeWidth!==undefined);
        if((!query&&!filtered)||query.length>1000)throw Error('请输入查找内容或指定字体 / 字号条件');
        if(a.fontSize!==undefined)numberSetting(a.fontSize,0.1,1296,'字号');if(a.sizeCompare&&!/^(equal|greater|less)$/.test(a.sizeCompare))throw Error('字号比较无效');
        var textFillIdentity=a.textFill!==undefined?textFillKey(a.textFill):null;
        var key=stringify([query,a.scope,!!a.matchCase,!!a.wholeWord,a.font||'',a.fontStyle||'',a.fontSize,a.sizeCompare||'equal',a.fill,a.stroke,a.strokeWidth,textFillIdentity]);
        if(a.operation==='find'){
            textSearchCache=null;
            if(a.scope==='selection'){if(selectedTextRange(d))throw Error('查找范围按对象或群组划定，请先退出文字编辑并框选范围');selection=selectedItems(d);if(!selection.length)throw Error('请先选择文字或群组；空选区不会查找全文档');frames=textFramesIn(selection);}
            else for(i=0;i<d.textFrames.length;i++){var frame=d.textFrames[i],lim=limits(frame);if(lim.hidden||lim.locked){skipped.push({objectId:'text-'+i,reason:'隐藏或锁定文字未参与'});continue;}if(a.scope==='layer'&&frame.layer!==context)continue;if(a.scope==='artboard'){var fb=editorBounds(frame),ab=bounds(d.artboards[context].artboardRect);if(fb[2]<=ab[0]||fb[0]>=ab[2]||fb[3]<=ab[1]||fb[1]>=ab[3])continue;}frames.push(frame);}
            var processed=0,fontWarnings={};
            function noteUnresolvedFont(style,index){if(style.unresolved&&!fontWarnings[index]){fontWarnings[index]=true;skipped.push({objectId:'story-'+index,reason:'部分字体信息不可读取；文字内容可查找，无法确认字体条件'});}if(a.textFill!==undefined&&style.unresolvedFill&&!fontWarnings['fill-'+index]){fontWarnings['fill-'+index]=true;skipped.push({objectId:'story-'+index,reason:'渐变、图案或未解析文字填色未参与颜色匹配'});}}
            for(i=0;i<frames.length;i++){
                var f=frames[i],story=f.story,storyIndex=-1,si,whole=a.scope==='document',skipStory=false;for(si=0;si<stories.length;si++)if(String(stories[si].textFrames[0].uuid)===String(story.textFrames[0].uuid)){storyIndex=si;break;}if(whole&&storyIndex>=0)continue;if(storyIndex<0){storyIndex=stories.length;stories.push(story);}
                // Partial threaded stories cannot be edited safely if another frame is protected.
                for(si=0;si<story.textFrames.length;si++){var sl=limits(story.textFrames[si]);if(sl.hidden||sl.locked)skipStory=true;}if(skipStory){skipped.push({objectId:'story-'+storyIndex,reason:'串接故事含隐藏或锁定文字，未参与'});continue;}
                var searchRange=whole?story.textRange:f.textRange,base=whole?0:f.textRange.start,text=String(searchRange.contents),chars=searchRange.characters,total=chars.length,offsets=[0],lookup={'0':0},sum=0,storyText=String(story.textRange.contents),proof=[];for(si=0;si<story.textFrames.length;si++){var sf=story.textFrames[si];proof.push({item:sf,parent:sf.parent,stamp:displayStamp(sf),start:sf.textRange.start,end:sf.textRange.end});}
                processed+=total;if(processed>200000)throw Error('范围超过 20 万字符，请缩小范围');
                for(j=0;j<total;j++){sum+=String(chars[j].contents).length;offsets.push(sum);lookup[String(sum)]=j+1;}
                function addHit(start,end,at,length){
                    var r=story.textRange.characters[base+start];r.length=end-start;var style=finderTextStyle(r,a);noteUnresolvedFont(style,storyIndex);if(!style.ok)return;
                    hits.push({frame:f,parent:f.parent,story:story,storyIndex:storyIndex,proof:proof,text:storyText,start:base+start,end:base+end,style:style.stamp,preview:(f.name?f.name+' · ':'')+text.substring(Math.max(0,at-12),Math.min(text.length,at+length+12))});if(hits.length>10000)throw Error('匹配超过 10000 处，请缩小范围');
                }
                if(!query){var runStart=-1;for(j=0;j<=total;j++){var charStyle=j<total?finderTextStyle(chars[j],a):null;if(charStyle)noteUnresolvedFont(charStyle,storyIndex);var match=!!charStyle&&charStyle.ok;if(match&&runStart<0)runStart=j;if(!match&&runStart>=0){addHit(runStart,j,offsets[runStart],offsets[j]-offsets[runStart]);runStart=-1;}}}
                else{var hay=a.matchCase?text:text.toLowerCase(),needle=a.matchCase?query:query.toLowerCase(),at=0;if(hay.length!==text.length||needle.length!==query.length)throw Error('此文字大小写转换改变长度，请启用区分大小写');while((at=hay.indexOf(needle,at))>=0){var start=lookup[String(at)],end=lookup[String(at+query.length)],word=true;if(a.wholeWord){var wordChar=/[A-Za-z0-9_\u00c0-\u02af\u0370-\u052f\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;word=!(at>0&&wordChar.test(text.charAt(at-1)))&&!(at+query.length<text.length&&wordChar.test(text.charAt(at+query.length)));}if(start!==undefined&&end>start&&word)addHit(start,end,at,query.length);at+=query.length;}}
            }
            textSearchCache={sid:sid,token:sid+':search-'+(++serial),key:key,context:context,hits:hits};result=resultEdit('查找到 '+hits.length+' 处文字',[],skipped);result.matchCount=hits.length;result.searchToken=textSearchCache.token;result.matches=[];for(i=0;i<hits.length;i++)result.matches.push({index:i,preview:hits[i].preview,count:1});return result;
        }
        var stored=textSearchCache;if(!stored||stored.sid!==sid||stored.token!==a.searchToken||stored.key!==key||stored.context!==context)throw Error('查找结果已过期，请重新查找');
        var indexes=finderIndexes(stored,a),validated={};for(i=0;i<indexes.length;i++){var hit=stored.hits[indexes[i]],l=limits(hit.frame);if(!validated[hit.storyIndex]){if(hit.story.textFrames.length!==hit.proof.length||String(hit.story.textRange.contents)!==hit.text)throw Error('匹配文字或串接故事已变化，请重新查找');for(j=0;j<hit.proof.length;j++){var proof=hit.proof[j],sf=hit.story.textFrames[j],currentLimit=limits(sf);if(currentLimit.hidden||currentLimit.locked||sf!==proof.item||sf.parent!==proof.parent||displayStamp(sf)!==proof.stamp||sf.textRange.start!==proof.start||sf.textRange.end!==proof.end)throw Error('文字范围、位置或层级已变化，请重新查找');}validated[hit.storyIndex]=true;}if(hit.frame.parent!==hit.parent||l.hidden||l.locked)throw Error('匹配文字或层级已变化，请重新查找');var hr=hit.story.textRange.characters[hit.start];hr.length=hit.end-hit.start;if(finderTextStyle(hr,a).stamp!==hit.style)throw Error('匹配样式已变化，请重新查找');hits.push(hit);}
        if(!hits.length)throw Error('没有匹配项');
        if(a.operation==='locate'){if(hits.length!==1)throw Error('请选择一个匹配项定位');var one=hits[0],range=one.story.textRange.characters[one.start];range.length=one.end-one.start;d.selection=null;range.select();var centerFrame=one.frame;for(j=0;j<one.story.textFrames.length;j++)if(one.story.textFrames[j].textRange.start<=one.start&&one.story.textFrames[j].textRange.end>one.start){centerFrame=one.story.textFrames[j];break;}finderCenter(d,centerFrame);app.redraw();return resultEdit('已选中第 '+(indexes[0]+1)+' 处匹配文字',['selection']);}
        if(a.operation==='select'){d.selection=null;for(i=0;i<hits.length;i++){var hf=hits[i].story.textFrames;for(j=0;j<hf.length;j++)if(hf[j].textRange.start<hits[i].end&&hf[j].textRange.end>hits[i].start)hf[j].selected=true;}app.redraw();return resultEdit('已框选含 '+hits.length+' 处匹配文字的文本框',['selection']);}
        if(a.operation==='replace-style')return applyTextStyleReplacement(d,hits,a);
        var font=null;if(a.operation==='replace-font'){try{font=app.textFonts.getByName(a.replacementFont);}catch(noFont){throw Error('替换字体不可用，请选择 Illustrator 字体库中的款式');}}
        else if(a.operation!=='replace'||typeof a.replacement!=='string'||a.replacement.length>10000)throw Error('替换参数无效');
        hits.sort(function(x,y){return x.storyIndex-y.storyIndex||x.start-y.start;});var replaced=0;try{for(i=hits.length-1;i>=0;i--){var h=hits[i],r=h.story.textRange.characters[h.start];r.length=h.end-h.start;if(font)setCharacterValue(d,r,'textFont',font);else r.contents=a.replacement;replaced++;}}catch(replaceError){textSearchCache=null;return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:'已完成 '+replaced+' 处；剩余失败：'+replaceError.message}};}
        textSearchCache=null;app.redraw();return resultEdit('已替换 '+replaced+' 处匹配'+(font?'字体':'文字')+'，其他字符保持原样',['text-replace']);
    }

    function outlineEditorText(d,refs,a){var items=[],i,skipped=[];if(a.scope==='document'){for(i=0;i<d.textFrames.length;i++){var f=d.textFrames[i],l=limits(f);if(l.hidden||l.locked){skipped.push({objectId:'text-'+i,reason:'隐藏或锁定'});}else{items.push(f);}}}else{for(i=0;i<refs.length;i++){items.push(refs[i].item);}}var frames=textFramesIn(items);if(!frames.length){throw Error('范围内没有可转曲文字');}var hasThreaded=false,selectedIds={},j;for(i=0;i<frames.length;i++){selectedIds[String(frames[i].uuid)]=true;if(frames[i].story.textFrames.length>1){hasThreaded=true;}}if(hasThreaded){for(i=0;i<frames.length;i++){var linked=frames[i].story.textFrames;for(j=0;j<linked.length;j++){if(!selectedIds[String(linked[j].uuid)]){throw Error('请选中串接故事的全部可编辑文本框后转曲；不能只转其中一框');}}}d.selection=null;for(i=0;i<frames.length;i++){frames[i].selected=true;}try{app.executeMenuCommand('outline');for(i=0;i<d.textFrames.length;i++){if(selectedIds[String(d.textFrames[i].uuid)]){throw Error('部分文字仍未转曲');}}}catch(outlineError){return {status:'failed',selectedObjectIds:[],skipped:skipped,sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:'原生转曲未完整完成，请检查：'+outlineError.message}};}return resultEdit('已通过原生转曲处理 '+frames.length+' 个文字框',['outlines'],skipped);}var done=0;try{for(i=0;i<frames.length;i++){frames[i].createOutline();done++;}}catch(e){return {status:'failed',selectedObjectIds:[],skipped:skipped,sideEffects:done?['partial-write']:[],error:{code:'HOST_SCRIPT_ERROR',message:'已转曲 '+done+' 个，剩余失败：'+e.message}};}return resultEdit('已转曲 '+done+' 个文字框',['outlines'],skipped);}

    // Variable data: frozen explicit template selection, writes only a new output document.
    var variableTemplate=null;
    function variableChildren(item){var list=[];if(item.typename==='GroupItem')for(var i=0;i<item.pageItems.length;i++)if(item.pageItems[i].parent===item)list.push(item.pageItems[i]);return list;}
    function variableMask(item){if(item.typename==='PathItem')return item.clipping===true;if(item.typename==='CompoundPathItem')for(var i=0;i<item.pathItems.length;i++)if(item.pathItems[i].clipping)return true;return false;}
    function variableOpen(doc){try{if(!doc)return false;String(doc.name);}catch(closedReference){return false;}for(var i=0;i<app.documents.length;i++)if(app.documents[i]===doc)return true;return false;}
    function variableRootOrder(a,b){
        function index(list,item){for(var k=0;k<list.length;k++)if(list[k]===item)return k;throw Error('模板层级引用失效');}
        if(a.parent===b.parent)return index(a.parent.pageItems,a)-index(b.parent.pageItems,b);
        function chain(item){var list=[],p=item.parent;while(p&&p.typename==='Layer'){list.unshift(p);p=p.parent;}return list;}
        var ac=chain(a),bc=chain(b);for(var i=0;i<Math.min(ac.length,bc.length);i++)if(ac[i]!==bc[i])return index(ac[i].parent.layers,ac[i])-index(bc[i].parent.layers,bc[i]);
        throw Error('模板同时包含父图层对象与子图层对象，请先整理为完整群组');
    }
    function variableCapture(d,refs,a,cache){
        var selected=selectedItems(d),i,j,count=0,chars=0,points=0,targets=[],nodes=[];
        var roots=[],boardIndex=d.artboards.getActiveArtboardIndex(),captureSignature=null;
        if(a&&a.artboardIndex!==undefined){
            checkedBoardIndexes(d,cache,[a.artboardIndex]);boardIndex=a.artboardIndex;var data=boardRegionData(d);
            if(!a.artworkAssignments){cache.variableGeometry=data.signature;var measured=resultEdit('已读取模板画板可见区域');measured.boardRegions=data.nodes;measured.ownershipBoards=data.boards;return measured;}
            if(cache.variableGeometry!==data.signature||!(a.artworkAssignments instanceof Array)||a.artworkAssignments.length!==data.refs.length)throw Error('模板设计或画板已改变，请重新选择模板');
            for(i=0;i<data.refs.length;i++){var owner=a.artworkAssignments[i];if(typeof owner!=='number'||owner%1||owner< -1||owner>=d.artboards.length)throw Error('模板画板归属无效');if(owner===boardIndex)roots.push(data.refs[i].item);}
            if(!roots.length)throw Error('指定画板没有归属设计，未扩大到其他画板');captureSignature=data.signature;
        }else{
            if(!selected.length||selected.length!==refs.length)throw Error('请明确选中整版模板内容，空选区不会扩大到画板');
            for(i=0;i<refs.length;i++)if(refs[i].item!==selected[i]||refs[i].item.parent!==refs[i].parent||displayStamp(refs[i].item)!==refs[i].stamp)throw Error('模板选区已改变，请重选');
            roots=exportRoots(refs);
        }
        roots.sort(variableRootOrder);if(roots.length>100)throw Error('模板根对象超过 100 个，请合理编组或缩小模板');
        function walk(item,path){
            if(++count>1000)throw Error('单个模板超过 1000 个对象，请精简');
            if(item.typename==='PathItem'){points+=item.pathPoints.length;if(points>20000)throw Error('模板路径节点超过 20000 个');}
            var text=item.typename==='TextFrame'?String(item.contents):undefined;if(text){chars+=text.length;if(chars>50000)throw Error('模板文字超过 50000 字符');}
            var b=exportBounds(item),id='t'+nodes.length;nodes.push({id:id,item:item,path:path,parent:item.parent});
            var limit=limits(item);if(!limit.hidden&&!limit.locked&&!variableMask(item))targets.push({id:id,name:String(item.name||''),kind:item.typename,text:text,width:b[2]-b[0],height:b[3]-b[1],rectangle:item.typename==='PathItem'&&productivityRect(item)});
            var children=variableChildren(item);for(var k=0;k<children.length;k++)walk(children[k],path.concat([k]));
        }
        for(i=0;i<roots.length;i++){if(roots[i].parent.typename!=='Layer')throw Error('请选择完整父群组，不从群组内部截取模板');var l=limits(roots[i]);if(l.hidden||l.locked)throw Error('模板根对象隐藏或锁定');walk(roots[i],[i]);}
        if(!targets.length)throw Error('模板没有可绑定对象');
        var board=d.artboards[boardIndex],rect=[board.artboardRect[0],board.artboardRect[1],board.artboardRect[2],board.artboardRect[3]],artworkBox=bounds(rect);
        for(i=0;i<roots.length;i++){var rb=exportBounds(roots[i]);artworkBox=[Math.min(artworkBox[0],rb[0]),Math.min(artworkBox[1],rb[1]),Math.max(artworkBox[2],rb[2]),Math.max(artworkBox[3],rb[3])];}
        positive(rect[2]-rect[0]);positive(rect[1]-rect[3]);try{if(d.scaleFactor&&d.scaleFactor!==1)throw Error('可变数据暂不处理大画布缩放文档');}catch(scaleError){if(String(scaleError).indexOf('大画布')>=0)throw scaleError;}
        var rootRefs=[];for(i=0;i<roots.length;i++)rootRefs.push({item:roots[i],parent:roots[i].parent,signature:editSignature(roots[i])});
        var styles=[],graphics=[];for(i=0;i<d.characterStyles.length;i++)styles.push(d.characterStyles[i].name);for(i=0;i<d.graphicStyles.length;i++)graphics.push(d.graphicStyles[i].name);
        variableTemplate={doc:d,token:session(d)+':variable-'+(++serial),roots:roots,refs:rootRefs,nodes:nodes,rect:rect,boards:boardStamp(d),extra:null,count:count,chars:chars,preview:null,captureSignature:captureSignature,artworkBox:artworkBox};
        variableTemplate.extra=variableExtra(variableTemplate);
        var r=resultEdit('已记录模板：'+count+' 个对象');r.variableTemplate={token:variableTemplate.token,docSessionId:session(d),boardIndex:boardIndex,docName:String(d.name),boardName:board.name,width:rect[2]-rect[0],height:rect[1]-rect[3],artworkWidth:artworkBox[2]-artworkBox[0],artworkHeight:artworkBox[3]-artworkBox[1],objectCount:count,targets:targets,characterStyles:styles,graphicStyles:graphics};return r;
    }
    function variableBindSelection(d,a){
        var t=variableTemplate;if(!t||t.token!==a.templateToken||t.doc!==d)throw Error('请切回模板文档并重新选择要绑定的对象');
        if(boardStamp(d)!==t.boards||variableExtra(t)!==t.extra)throw Error('模板外观已改变，请重新记录');validRefs(t.refs);
        var items=selectedItems(d);if(items.length!==1)throw Error('请在画布上直接选择一个模板对象，再点击绑定');
        for(var i=0;i<t.nodes.length;i++)if(t.nodes[i].item===items[0]){var lim=limits(items[0]);if(lim.hidden||lim.locked||variableMask(items[0]))throw Error('不能绑定隐藏、锁定对象或现有蒙版路径');var r=resultEdit('已读取画布所选模板对象');r.variableTargetId=t.nodes[i].id;return r;}
        throw Error('所选对象不属于已记录的模板画板');
    }
    function variableImages(a){
        if(typeof a.folder!=='string'||!a.folder||/[\r\n]/.test(a.folder))throw Error('请选择图片目录');var folder=new Folder(a.folder);if(!folder.exists)throw Error('图片目录不存在');
        var entries=folder.getFiles(),files=[];if(entries.length>5000)throw Error('目录超过 5000 项，请拆分图片目录');
        for(var i=0;i<entries.length;i++)if(entries[i] instanceof File&&/\.(png|jpe?g|tiff?|psd)$/i.test(entries[i].name))files.push(entries[i].fsName);
        files.sort();if(!files.length)throw Error('所选目录没有 PNG、JPG、TIFF 或 PSD 图片');var r=resultEdit('已导入 '+files.length+' 张图片；按文件名精确匹配');r.files=files;r.folder=folder.fsName;return r;
    }
    function variableExtra(template){var parts=[String(template.doc.documentColorSpace),template.doc.rasterEffectSettings.resolution];
        for(var i=0;i<template.nodes.length;i++){var p=template.nodes[i].item;parts.push(p.opacity,String(p.blendingMode),p.hidden,p.locked,p.typename==='GroupItem'?p.clipped:false);if(p.typename==='PlacedItem')parts.push(p.file.fsName);}
        for(i=0;i<template.roots.length;i++){var layer=template.roots[i].parent;while(layer&&layer.typename==='Layer'){parts.push(layer.name,layer.opacity,String(layer.blendingMode),layer.visible,layer.locked);layer=layer.parent;}}
        return parts.join('|');
    }
    function variableNode(template,id){for(var i=0;i<template.nodes.length;i++)if(template.nodes[i].id===id)return template.nodes[i];throw Error('模板对象绑定失效');}
    function variableDescendant(item,parent){var p=item.parent;while(p&&p.typename!=='Document'){if(p===parent)return true;p=p.parent;}return false;}
    function variableOffsets(frame){var offsets=[0],sum=0;for(var i=0;i<frame.characters.length;i++){sum+=String(frame.characters[i].contents).length;offsets.push(sum);}if(sum!==String(frame.contents).length)throw Error('宿主字符索引与文字不一致');return offsets;}
    function variableRange(frame,start,end){var offsets=variableOffsets(frame),a=-1,b=-1;for(var i=0;i<offsets.length;i++){if(offsets[i]===start)a=i;if(offsets[i]===end)b=i;}if(a<0||b<=a)throw Error('绑定范围跨越不可分割字符或为空');var range=frame.characters[a];range.length=b-a;return {range:range,start:a,end:b};}
    function variableText(frame,b,value,out,source,frozenStart){
        var original=String(frame.contents),needle=b.placeholder||original,start=frozenStart!==undefined?frozenStart:b.placeholder?original.indexOf(needle):0;
        if(!original||start<0||original.substr(start,needle.length)!==needle||frozenStart===undefined&&b.placeholder&&original.indexOf(needle,start+1)>=0)throw Error('绑定占位符为空、失效或出现多次');
        if(!b.placeholder){var styles=fontAttributes(frame);for(var si=1;si<styles.length;si++)if(stringify(styles[si])!==stringify(styles[0]))throw Error('整框含混合样式，请填写占位符并拆分绑定');}
        var found=variableRange(frame,start,start+needle.length),attributes=found.range.characters[0].characterAttributes,base={},keys=['textFont','size','leading','tracking','baselineShift','horizontalScale','verticalScale','strokeWeight','fillColor','strokeColor','overprintFill','overprintStroke','underline','strikeThrough','autoLeading'],i,k;
        for(k=0;k<keys.length;k++){try{base[keys[k]]=attributes[keys[k]];}catch(optional){}}
        // A uniform font/size is not a uniform character style. Refuse before
        // replacing content when any attribute we would broadcast is mixed.
        if(!b.placeholder){for(var mixedIndex=1;mixedIndex<frame.characters.length;mixedIndex++){var candidate=frame.characters[mixedIndex].characterAttributes;for(k=0;k<keys.length;k++){var attributeKey=keys[k];if(attributeKey==='textFont'||attributeKey==='fillColor'||attributeKey==='strokeColor')continue;var currentAttribute;try{currentAttribute=candidate[attributeKey];}catch(unreadableAttribute){if(base[attributeKey]!==undefined)throw Error('整框含混合样式或不可读取属性，请填写占位符并拆分绑定');continue;}if(String(currentAttribute)!==String(base[attributeKey]))throw Error('整框含混合样式，请填写占位符并拆分绑定');}}}
        var replacement=String(value.text).replace(/\r\n|\n/g,'\r');found.range.contents=replacement;
        if(!replacement)return;
        var inserted=variableRange(frame,start,start+replacement.length),range=inserted.range;
        for(k=0;k<keys.length;k++)if(base[keys[k]]!==undefined)range.characterAttributes[keys[k]]=base[keys[k]];
        if(base.textFont)setCharacterValue(out,range,'textFont',base.textFont);
        if(b.style==='custom'){
            if(b.characterStyle)source.characterStyles.getByName(b.characterStyle).applyTo(range,false);
            if(b.font)setCharacterValue(out,range,'textFont',app.textFonts.getByName(b.font));
            if(b.size!==undefined)setCharacterValue(out,range,'size',b.size);
        }
        if(b.style!=='template'){
            var runs=value.runs||[],offset=start;for(i=0;i<runs.length;i++){var text=String(runs[i].text).replace(/\r\n|\n/g,'\r');if(text&&runs[i].bold){if(!b.boldFont)throw Error('未设置粗体款式');var bold=variableRange(frame,offset,offset+text.length);setCharacterValue(out,bold.range,'textFont',app.textFonts.getByName(b.boldFont));}offset+=text.length;}
            if(offset!==start+replacement.length)throw Error('表格富文本范围不一致');
        }
    }
    function variableFits(frame,box){
        if(frame.kind===TextType.PATHTEXT||frame.story.textFrames.length!==1)throw Error('路径文字和串接文字暂不支持可变字段');
        if(!frame.contents)return true;
        if(frame.kind===TextType.AREATEXT){var visible='';for(var i=0;i<frame.lines.length;i++)visible+=String(frame.lines[i].contents);return visible.replace(/[\r\n]/g,'')===String(frame.contents).replace(/[\r\n]/g,'');}
        var b=exportBounds(frame),heightAllowance=0.2;if(frame.lines.length===1)heightAllowance=Math.max(heightAllowance,frame.textRange.characterAttributes.size*0.3);return b[2]-b[0]<=box[2]-box[0]+0.2&&b[3]-b[1]<=box[3]-box[1]+heightAllowance;
    }
    function variableFitText(frame,box,b,out){
        if(variableFits(frame,box))return;
        if(b.overflow!=='shrink'||b.placeholder)throw Error('文字超出模板容纳范围');
        if(!isFinite(b.minSize)||b.minSize<1||b.minSize>1296)throw Error('最小字号无效');
        var base=[],min=Infinity,i,uniform=true;for(i=0;i<frame.characters.length;i++){base.push(frame.characters[i].characterAttributes.size);min=Math.min(min,base[i]);if(i&&base[i]!==base[0])uniform=false;}
        for(var step=1;step<=20;step++){var ratio=1-step*0.05;if(min*ratio<b.minSize)ratio=b.minSize/min;if(ratio>=1)break;if(uniform)frame.textRange.characterAttributes.size=base[0]*ratio;else for(i=0;i<base.length;i++)frame.characters[i].characterAttributes.size=base[i]*ratio;if(variableFits(frame,box))return;if(min*ratio<=b.minSize+0.001)break;}
        throw Error('文字缩至最小字号仍不能完整容纳');
    }
    function variablePaint(target,fill){if(target.typename==='TextFrame'){for(var i=0;i<target.characters.length;i++)target.characters[i].characterAttributes.fillColor=makeColor(fill);}else if(target.typename==='PathItem'&&!target.clipping){target.filled=true;target.fillColor=makeColor(fill);}else throw Error('填色仅支持普通路径或文字框');}
    function variableBoxGroup(target){var box=exportBounds(target),group=target.parent.groupItems.add();group.move(target,ElementPlacement.PLACEBEFORE);return {group:group,box:box};}
    function variableFitGraphic(item,group,box,fit){
        var old=exportBounds(item),w=old[2]-old[0],h=old[3]-old[1],tw=box[2]-box[0],th=box[3]-box[1];positive(w);positive(h);positive(tw);positive(th);
        var ratio=Math.min(tw/w,th/h);if(fit==='cover')ratio=Math.max(tw/w,th/h);else if(fit==='width')ratio=tw/w;else if(fit==='height')ratio=th/h;else if(fit!=='contain')throw Error('图片适配方式无效');item.resize(ratio*100,ratio*100,true,true,true,true,ratio*100,Transformation.CENTER);
        var after=exportBounds(item);item.translate(box[0]+(tw-(after[2]-after[0]))/2-after[0],-(box[1]+(th-(after[3]-after[1]))/2)+after[1]);
        if(fit==='cover'){var mask=group.pathItems.rectangle(-box[1],box[0],tw,th);mask.filled=false;mask.stroked=false;mask.clipping=true;mask.zOrder(ZOrderMethod.BRINGTOFRONT);group.clipped=true;}
    }
    function variableGraphic(template,target,b,value,out){
        if(b.kind==='image'&&(target.typename!=='PathItem'||!productivityRect(target)))throw Error('图片必须绑定未旋转的矩形对象，用作剪切蒙版');
        var created=variableBoxGroup(target),group=created.group,item;
        if(b.kind==='image'){var file=new File(value.text);if(!file.exists||!/\.(png|jpe?g|tiff?|psd)$/i.test(file.name))throw Error('图片文件缺失或格式不支持');created.box=bounds(target.geometricBounds);item=out.placedItems.add();item.move(group,ElementPlacement.PLACEATEND);item.file=file;variableFitGraphic(item,group,created.box,b.fit);item.embed();if(b.fit!=='cover'){var imageMask=duplicatePosition(target,group,ElementPlacement.PLACEATBEGINNING);imageMask.filled=false;imageMask.stroked=false;imageMask.clipping=true;imageMask.zOrder(ZOrderMethod.BRINGTOFRONT);group.clipped=true;}}
        else{var source=null;for(var i=0;i<template.nodes.length;i++){var n=template.nodes[i].item;if(String(n.name)===value.text){if(source)throw Error('来源图形名称重复');source=n;}}if(!source||!/^(PathItem|CompoundPathItem|GroupItem)$/.test(source.typename))throw Error('找不到唯一的普通来源图形');var sourceLimit=limits(source);if(sourceLimit.hidden||sourceLimit.locked)throw Error('来源图形隐藏或锁定');var parent=source.parent;while(parent&&parent.typename==='GroupItem'){if(parent.opacity!==100||parent.blendingMode!==BlendModes.NORMAL||parent.clipped)throw Error('来源图形需选择完整外观父群组');parent=parent.parent;}while(parent&&parent.typename==='Layer'){if(parent.opacity!==100||parent.blendingMode!==BlendModes.NORMAL)throw Error('来源图形的图层外观需先归入完整群组');parent=parent.parent;}item=duplicatePosition(source,group,ElementPlacement.PLACEATEND);variableFitGraphic(item,group,created.box,b.fit);}
        group.opacity=target.opacity;group.blendingMode=target.blendingMode;target.remove();return group;
    }
    function variableQr(target,matrix,out){
        if(!(matrix instanceof Array)||matrix.length<21||matrix.length>177||(matrix.length-21)%4)throw Error('二维码矩阵无效');
        var n=matrix.length,r,c;for(r=0;r<n;r++)if(typeof matrix[r]!=='string'||matrix[r].length!==n||/[^01]/.test(matrix[r]))throw Error('二维码矩阵无效');
        var created=variableBoxGroup(target),box=created.box,g=created.group,size=Math.min(box[2]-box[0],box[3]-box[1]),unit=size/(n+8),left=box[0]+(box[2]-box[0]-size)/2,top=-box[1]-(box[3]-box[1]-size)/2;
        if(unit<72/25.4*0.2)throw Error('二维码模块小于 0.2 mm');
        function paint(black){if(String(out.documentColorSpace)==='DocumentColorSpace.CMYK'){var cm=new CMYKColor();cm.cyan=cm.magenta=cm.yellow=0;cm.black=black?100:0;return cm;}var rgb=new RGBColor();rgb.red=rgb.green=rgb.blue=black?0:255;return rgb;}
        function rect(y,x,w,h,black){var p=g.pathItems.rectangle(y,x,w,h);p.stroked=false;p.filled=true;p.fillColor=paint(black);p.fillOverprint=false;}
        rect(top,left,size,size,false);for(r=0;r<n;r++){c=0;while(c<n){if(matrix[r].charAt(c)==='0'){c++;continue;}var start=c;while(c<n&&matrix[r].charAt(c)==='1')c++;rect(top-(r+4)*unit,left+(start+4)*unit,(c-start)*unit,unit,true);}}
        target.remove();return g;
    }
    function variableOutputBox(layer,rect){
        var box=bounds(rect);
        function visit(l){var items=l.pageItems,n=items.length;for(var i=0;i<n;i++)if(items[i].parent===l){var b=exportBounds(items[i]);box=[Math.min(box[0],b[0]),Math.min(box[1],b[1]),Math.max(box[2],b[2]),Math.max(box[3],b[3])];}var layers=l.layers;for(var j=0,count=layers.length;j<count;j++)visit(layers[j]);}
        visit(layer);return box;
    }
    function variableGenerate(a){
        var t=variableTemplate;if(!t||t.token!==a.templateToken||!variableOpen(t.doc))throw Error('模板已失效，请重新选择并记为模板');
        if(app.activeDocument!==t.doc&&app.activeDocument!==t.preview&&app.activeDocument!==t.output)throw Error('当前文档不是模板或本次成品，请切回模板');
        t.doc.activate();var sourceRasterResolution=t.doc.rasterEffectSettings.resolution,sourceUnits=t.doc.rulerUnits,sourceColor=String(t.doc.documentColorSpace);
        if(boardStamp(t.doc)!==t.boards||variableExtra(t)!==t.extra)throw Error('模板画板或外观已改变，请重新记录模板');validRefs(t.refs);
        if(t.captureSignature&&boardRegionData(t.doc).signature!==t.captureSignature)throw Error('模板归属设计已改变，请重新记录模板');
        if(a.operation==='preview'&&t.preview&&variableOpen(t.preview))throw Error('上次预览仍打开，请核对并关闭后再生成新的预览');
        if(a.operation==='generate'&&t.output&&variableOpen(t.output))throw Error('本模板上批成品仍打开，请保存并关闭后再生成下一批，避免积累文档');
        var rows=a.rows,bindings=a.bindings,i,j,k;if(!(rows instanceof Array)||!rows.length||rows.length>100||!(bindings instanceof Array)||!bindings.length||bindings.length>100)throw Error('每批须为 1–100 条记录和 1–100 个绑定');
        if(a.operation==='preview'&&rows.length!==1)throw Error('预览一次只生成一条');
        var gapX=a.horizontalGap===undefined?a.gap:a.horizontalGap,gapY=a.verticalGap===undefined?a.gap:a.verticalGap,rowsPerBlock=a.rowsPerBlock===undefined?100:a.rowsPerBlock;
        if(typeof a.columns!=='number'||a.columns%1||a.columns<1||a.columns>10||typeof rowsPerBlock!=='number'||rowsPerBlock%1||rowsPerBlock<1||rowsPerBlock>100||typeof gapX!=='number'||!isFinite(gapX)||gapX<0||gapX>3000||typeof gapY!=='number'||!isFinite(gapY)||gapY<0||gapY>3000)throw Error('画板行列容量或间距无效；间距不能为负');
        var width=t.rect[2]-t.rect[0],height=t.rect[1]-t.rect[3],cols=a.columns,capacity=cols*rowsPerBlock,positions=[],totalWidth=0,totalHeight=0;
        var minimumX=t.artworkBox?Math.max(0,t.artworkBox[2]-t.artworkBox[0]-width):0,minimumY=t.artworkBox?Math.max(0,t.artworkBox[3]-t.artworkBox[1]-height):0;
        if(((rows.length>1&&cols>1)||rows.length>capacity)&&gapX+.001<minimumX||rows.length>cols&&rowsPerBlock>1&&gapY+.001<minimumY)throw Error('间距不足，画板外模板设计会重叠；请增大横向或纵向间距');
        for(i=0;i<rows.length;i++){var slot=i%capacity,px=(Math.floor(i/capacity)*cols+slot%cols)*(width+gapX),py=-Math.floor(slot/cols)*(height+gapY);positions.push([px,py]);totalWidth=Math.max(totalWidth,px+width);totalHeight=Math.max(totalHeight,-py+height);}
        if(totalWidth>14400||totalHeight>14400)throw Error('本批画板排布超过普通画布范围，请减少记录或调整每行数量');
        var bindingMap={},nodeMap={},seenRows={},estimate=t.count*rows.length,estimatedChars=t.chars*rows.length,imageBytes=0;
        for(i=0;i<bindings.length;i++){var b=bindings[i],node=variableNode(t,b.targetId),item=node.item,limit=limits(item);if(limit.locked||limit.hidden||variableMask(item))throw Error('绑定对象隐藏、锁定或属于蒙版路径');
            if(!b.id||bindingMap[b.id]||!/^(text|image|qr|graphic|fill|opacity)$/.test(b.kind)||!/^(error|keep|clear)$/.test(b.empty)||!/^(template|emphasis|custom)$/.test(b.style))throw Error('绑定规则无效');
            if(b.kind==='text'){if(item.typename!=='TextFrame'||item.kind===TextType.PATHTEXT||item.story.textFrames.length!==1)throw Error('文字绑定仅支持独立点文字或区域文字');if(b.style==='custom'&&b.font)app.textFonts.getByName(b.font);if(b.style!=='template'&&b.boldFont)app.textFonts.getByName(b.boldFont);if(b.style==='custom'&&b.characterStyle)t.doc.characterStyles.getByName(b.characterStyle);}
            if((b.kind==='image'||b.kind==='graphic')&&!/^(contain|cover|width|height)$/.test(b.fit))throw Error('图形适配方式无效');
            if(b.kind==='image'&&(item.typename!=='PathItem'||!productivityRect(item)))throw Error('图片必须绑定未旋转的矩形对象，用作剪切蒙版');
            if(b.graphicStyle)t.doc.graphicStyles.getByName(b.graphicStyle);if(b.fill)makeColor(b.fill);
            if(b.size!==undefined&&(!isFinite(b.size)||b.size<0.1||b.size>1296))throw Error('字号无效');if(b.opacity!==undefined&&(!isFinite(b.opacity)||b.opacity<0||b.opacity>100))throw Error('不透明度无效');
            if(b.placeholder&&(b.opacity!==undefined||b.graphicStyle||b.fill))throw Error('局部文字绑定不能改变整个对象外观');
            for(j=0;j<i;j++){var other=bindings[j],oi=variableNode(t,other.targetId).item;if(oi===item&&(b.kind!=='text'||other.kind!=='text'||!b.placeholder||!other.placeholder||b.placeholder===other.placeholder))throw Error('同一对象绑定冲突');if(oi===item){var originalText=String(item.contents),bs=originalText.indexOf(b.placeholder),os=originalText.indexOf(other.placeholder);if(bs<0||os<0||bs<os+other.placeholder.length&&os<bs+b.placeholder.length)throw Error('同一文字框的占位符不存在或相互重叠');}if(variableDescendant(item,oi)||variableDescendant(oi,item))throw Error('不能同时替换父群组及内部字段');}
            bindingMap[b.id]=b;nodeMap[b.id]=node;
        }
        for(i=0;i<rows.length;i++){var row=rows[i];if(typeof row.row!=='number'||row.row%1||seenRows[row.row]||!(row.values instanceof Array)||row.values.length!==bindings.length)throw Error('记录编号或字段无效');seenRows[row.row]=true;var ids={};
            for(j=0;j<row.values.length;j++){var value=row.values[j],bb=bindingMap[value.bindingId];if(!bb||ids[value.bindingId]||typeof value.text!=='string'||value.text.length>20000)throw Error('记录字段无效');ids[value.bindingId]=true;if(value.skip)continue;estimatedChars+=value.text.length;
                if(!value.text&&!(bb.kind==='text'&&bb.empty==='clear'))throw Error('记录 '+row.row+' 有必填空值');
                if(bb.kind==='image'&&(!new File(value.text).exists||! /\.(png|jpe?g|tiff?|psd)$/i.test(value.text)))throw Error('记录 '+row.row+' 的图片路径无效');
                if(bb.kind==='image'){var imageFile=new File(value.text);if(imageFile.length>20*1024*1024)throw Error('单张图片超过 20 MB');imageBytes+=imageFile.length;}
                if(bb.kind==='qr'){if(!(value.qr instanceof Array))throw Error('二维码数据缺失');for(k=0;k<value.qr.length;k++){var runs=String(value.qr[k]).match(/1+/g);estimate+=runs?runs.length:0;}}
                if(bb.kind==='graphic')estimate+=t.count;
                if(bb.kind==='opacity'&&(!/^[0-9]+(\.[0-9]+)?$/.test(value.text)||Number(value.text)>100))throw Error('透明度列无效');if(bb.kind==='fill')makeColor(value.text);
            }
        }
        if(estimate>50000||estimatedChars>250000||imageBytes>128*1024*1024)throw Error('本批超过 50000 个对象、25 万字符或 128 MB 图片，请减少记录数');
        var output=null,outputReady=false,results=[],outputBoxes=[],progress=deliveryProgress(a,rows.length),interaction=app.userInteractionLevel,consecutive=0,hasPages=false;
        try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
            for(i=0;i<rows.length;i++){
                if(progress&&!progress.step(i+1))break;var recordLayer=null,board=null,added=false;
                try{
                    if(!output){output=app.documents.add(sourceColor==='DocumentColorSpace.RGB'?DocumentColorSpace.RGB:DocumentColorSpace.CMYK,width,height);if(a.operation==='preview')t.preview=output;else t.output=output;output.rulerUnits=sourceUnits;var outputRaster=output.rasterEffectSettings;outputRaster.resolution=sourceRasterResolution;output.rasterEffectSettings=outputRaster;outputReady=true;}
                    var left=positions[i][0],top=positions[i][1],rect=[left,top,left+width,top-height];
                    if(!hasPages)board=output.artboards[0];else{board=output.artboards.add(rect);added=true;}
                    board.artboardRect=rect;board.name=(a.operation==='preview'?'预览-':'')+('0000'+rows[i].row).slice(-4)+'-'+safeName(rows[i].name||'记录');
                    recordLayer=output.layers.add();recordLayer.name=board.name;var copied={},layerSources=[],layerCopies=[];
                    function layerFor(source){if(source.typename==='Document')return recordLayer;for(var li=0;li<layerSources.length;li++)if(layerSources[li]===source)return layerCopies[li];var parent=layerFor(source.parent),created=parent.layers.add();created.name=source.name;created.opacity=source.opacity;created.blendingMode=source.blendingMode;layerSources.push(source);layerCopies.push(created);return created;}
                    function pair(source,copy,path){if(source.typename!==copy.typename||String(source.name)!==String(copy.name))throw Error('模板复制层级不匹配');copied[path.join('.')]=copy;var sc=variableChildren(source),cc=variableChildren(copy);if(sc.length!==cc.length)throw Error('模板复制子对象数量不符');for(var pi=0;pi<sc.length;pi++)pair(sc[pi],cc[pi],path.concat([pi]));}
                    for(j=t.roots.length-1;j>=0;j--){var root=t.roots[j],clone=duplicatePosition(root,layerFor(root.parent),ElementPlacement.PLACEATBEGINNING);pair(root,clone,[j]);clone.translate(left-t.rect[0],top-t.rect[1]);}
                    var values=rows[i].values.slice(0);values.sort(function(x,y){var bx=bindingMap[x.bindingId],by=bindingMap[y.bindingId];if(bx.targetId!==by.targetId)return bx.targetId<by.targetId?-1:1;var text=String(nodeMap[x.bindingId].item.contents||'');return text.indexOf(by.placeholder)-text.indexOf(bx.placeholder);});
                    var fits=[],fitIds={};
                    for(j=0;j<values.length;j++){var v=values[j],rule=bindingMap[v.bindingId];if(v.skip)continue;var originalNode=nodeMap[v.bindingId],target=copied[originalNode.path.join('.')];
                        if(rule.kind==='text'){var oldBox=exportBounds(target);variableText(target,rule,v,output,t.doc,rule.placeholder?String(originalNode.item.contents).indexOf(rule.placeholder):0);if(!fitIds[rule.targetId]){fits.push({frame:target,box:oldBox,rule:rule});fitIds[rule.targetId]=true;}}
                        else if(rule.kind==='qr')target=variableQr(target,v.qr,output);
                        else if(rule.kind==='image'||rule.kind==='graphic')target=variableGraphic(t,target,rule,v,output);
                        else if(rule.kind==='fill')variablePaint(target,v.text);else if(rule.kind==='opacity')target.opacity=Number(v.text);
                        if(rule.kind!=='qr'){if(rule.graphicStyle)t.doc.graphicStyles.getByName(rule.graphicStyle).applyTo(target);if(rule.opacity!==undefined)target.opacity=rule.opacity;if(rule.fill)variablePaint(target,rule.fill);}
                    }
                    for(j=0;j<fits.length;j++)variableFitText(fits[j].frame,fits[j].box,fits[j].rule,output);
                    var outputBox=variableOutputBox(recordLayer,rect);for(j=0;j<outputBoxes.length;j++){var priorBox=outputBoxes[j];if(Math.min(outputBox[2],priorBox[2])-Math.max(outputBox[0],priorBox[0])>.001&&Math.min(outputBox[3],priorBox[3])-Math.max(outputBox[1],priorBox[1])>.001)throw Error('替换后设计超出预留间距并与其他记录重叠，请增大间距');}
                    for(j=0;j<layerSources.length;j++){layerCopies[j].visible=layerSources[j].visible;layerCopies[j].locked=layerSources[j].locked;}
                    outputBoxes.push(outputBox);results.push({row:rows[i].row,status:'completed',artboardIndex:output.artboards.length-1});hasPages=true;consecutive=0;if(progress)progress.done(rows[i].row);
                }catch(rowError){
                    var clean=true;try{if(recordLayer){recordLayer.locked=false;recordLayer.remove();}if(added&&board)board.remove();}catch(cleanup){clean=false;}
                    results.push({row:rows[i].row,status:'failed',reason:String(rowError.message||rowError)+(!outputReady?'；成品文档初始化失败，已停止批次':clean?'':'；本条残留对象未能清理，已停止')});if(!outputReady||!clean||++consecutive>=3)break;
                }
            }
            var good=0,bad=0;for(i=0;i<results.length;i++){if(results[i].status==='completed')good++;else bad++;}
            if(progress)progress.finish(bad,false);
            var result=resultEdit('可变数据：完成 '+good+' 条，失败 '+bad+' 条'+(progress&&progress.state.status==='cancelled'?'；已取消后续记录':''),good?['variable-data-output']:[],[]);result.variableRows=results;if(progress)result.exportProgress=progress.state;
            if(bad||good<rows.length)result.status='partial';if(!good&&bad){result.status='partial';result.message+='；'+results[0].reason;}
            if(output&&good){try{output.activate();output.artboards.setActiveArtboardIndex(0);output.selection=null;app.redraw();}catch(showOutput){result.status='partial';result.message+='；成品已保留，视图刷新未完成';}}else if(output){try{output.close(SaveOptions.DONOTSAVECHANGES);}catch(closeEmpty){result.status='partial';result.message+='；空成品文档未能关闭';}t.doc.activate();}
            return result;
        }finally{app.userInteractionLevel=interaction;}
    }

    // Geometry extraction is read-only. Boolean operations run in the panel core,
    // then a second write validates the same token and full geometry signatures.
    function smartRegions(d,cache,refs,forBoards,boards){
        if(!forBoards&&(refs.length<2||refs.length>300))throw Error('请选择 2–300 个完整对象');
        var visits=0,points=0;
        function pathRing(path){
            var ps=path.pathPoints,pointCount=ps.length,out=[];
            function add(p){if(++points>(forBoards?300000:24000))throw Error('可见区域路径过于复杂，请缩小范围');out.push([p[0],p[1]]);}
            function middle(a,b){return [(a[0]+b[0])/2,(a[1]+b[1])/2];}
            function distance(p,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],len=Math.sqrt(dx*dx+dy*dy);return len?Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/len:Math.sqrt(Math.pow(p[0]-a[0],2)+Math.pow(p[1]-a[1],2));}
            function curve(a,b,c,e,depth){if(depth>=12||Math.max(distance(b,a,e),distance(c,a,e))<=0.05){add(e);return;}var ab=middle(a,b),bc=middle(b,c),ce=middle(c,e),abc=middle(ab,bc),bce=middle(bc,ce),mid=middle(abc,bce);curve(a,ab,abc,mid,depth+1);curve(mid,bce,ce,e,depth+1);}
            if(!pointCount)return out;add(ps[0].anchor);
            for(var i=0;i<(path.closed?pointCount:pointCount-1);i++){var a=ps[i],b=ps[(i+1)%pointCount];curve(a.anchor,a.rightDirection,b.leftDirection,b.anchor,0);}return out;
        }
        function stroke(path,ring){
            var dashes=path.strokeDashes;for(var k in dashes)if(typeof dashes[k]==='number'&&dashes[k]>0)throw Error('虚线或艺术描边请先轮廓化后智能群组');
            var cap=String(path.strokeCap),join=String(path.strokeJoin);
            return {points:ring,width:path.strokeWidth,closed:path.closed,cap:cap.indexOf('ROUND')>=0?'round':cap.indexOf('PROJECTING')>=0?'square':'butt',join:join.indexOf('ROUND')>=0?'round':join.indexOf('BEVEL')>=0?'bevel':'miter',miterLimit:path.strokeMiterLimit};
        }
        function region(item,mask){
            if(++visits>(forBoards?100000:5000))throw Error('可见区域节点过多，请缩小范围');
            if(item.hidden||item.opacity===0)return {rings:[]};
            if(item.typename==='GroupItem'){
                var children=[],clip=item.clipped?clippingPath(item):null;
                if(item.clipped&&!clip)throw Error('无法识别剪切蒙版');
                for(var i=0,n=item.pageItems.length;i<n;i++){var child=item.pageItems[i];if(child.parent===item&&child!==clip)children.push(region(child,false));}
                var g={children:children};if(clip)g.clip=region(clip,true);return g;
            }
            if(item.typename==='PathItem'){
                if(!mask&&item.guides)return {rings:[]};
                var ring=pathRing(item),node={rings:mask||item.filled?[ring]:[],evenodd:item.evenodd};
                if(!mask&&item.stroked&&item.strokeWidth>0)node.stroke=stroke(item,ring);
                return node;
            }
            if(item.typename==='CompoundPathItem'){
                var rings=[],evenodd=false,strokes=[];
                for(var j=0;j<item.pathItems.length;j++){var p=item.pathItems[j],ring=pathRing(p);if(mask||p.filled)rings.push(ring);if(!mask&&p.stroked&&p.strokeWidth>0)strokes.push({stroke:stroke(p,ring)});evenodd=p.evenodd;}return {rings:rings,evenodd:evenodd,children:strokes};
            }
            if(item.typename==='TextFrame'||item.typename==='RasterItem'||item.typename==='PlacedItem'){
                var b=item.geometricBounds;return {rings:[[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]]};
            }
            throw Error('选区含暂不支持的智能群组对象：'+item.typename);
        }
        var result=resultEdit('已分析可见区域'),nodes=[],signatures=[];
        for(var i=0;i<refs.length;i++){var parent=refs[i].item.parent;while(parent&&parent.typename==='GroupItem'){if(parent.clipped)throw Error('请选中完整剪切蒙版组，不单独选择蒙版内部对象');parent=parent.parent;}nodes.push(forBoards&&boards&&quickBoardRegion(refs[i].item,boards)||region(refs[i].item,false));signatures.push(forBoards?String(refs[i].item.uuid)+'|'+fingerprint(refs[i].item,true):editSignature(refs[i].item));}
        cache.smartSignatures=signatures;cache.smartGeometry=stringify(nodes);result.groupRegions=nodes;return result;
    }
    function smartGroup(d,cache,refs,groups){
        if(!(groups instanceof Array)||!cache.smartSignatures||cache.smartSignatures.length!==refs.length)throw Error('请重新分析智能群组选区');
        var used={},plans=[],i,j;
        for(i=0;i<refs.length;i++)if(editSignature(refs[i].item)!==cache.smartSignatures[i])throw Error('对象内容已改变，请重新执行智能群组');
        var measuredGeometry=cache.smartGeometry;smartRegions(d,cache,refs);if(measuredGeometry!==cache.smartGeometry)throw Error('可见区域或描边已改变，请重新执行智能群组');
        for(i=0;i<groups.length;i++){
            if(!(groups[i] instanceof Array)||groups[i].length<2)throw Error('无效的群组计划');
            var members=[],parent=null;
            for(j=0;j<groups[i].length;j++){var n=groups[i][j];if(typeof n!=='number'||n%1||n<0||n>=refs.length||used[n])throw Error('群组计划含失效或重复对象');used[n]=true;var item=refs[n].item;if(parent&&item.parent!==parent)throw Error('相交对象跨图层或父群组，请先放到同一层级');parent=item.parent;members.push(item);}
            members.sort(function(a,b){return b.zOrderPosition-a.zOrderPosition;});plans.push({members:members,parent:parent});
        }
        var count=0,mutated=false;
        try{for(i=0;i<plans.length;i++){var plan=plans[i],g=plan.parent.groupItems.add();mutated=true;g.move(plan.members[0],ElementPlacement.PLACEBEFORE);g.name='智能群组';for(j=0;j<plan.members.length;j++)plan.members[j].move(g,ElementPlacement.PLACEATEND);g.selected=true;count++;}
            return resultEdit(count?'已建立 '+count+' 个智能群组；孤立对象保持不变（文字、图片按外框）':'可见区域没有交集，未改变群组',count?['structure']:[]);
        }catch(e){if(!mutated)throw e;return resultEdit('群组执行中断，已保留实际结果；可使用 Illustrator 撤销',['structure'],[{objectId:'',reason:String(e)}]);}
    }
    function ungroupAll(d,refs){
        if(!refs.length)throw Error('请选择要取消群组的对象');
        var plans=[],skipped=[],visits=0,seen=[];
        function walk(item){
            for(var si=0;si<seen.length;si++)if(seen[si]===item)return;seen.push(item);
            if(++visits>5000)throw Error('一次最多处理 5000 个节点');
            var lim=limits(item);if(lim.locked||lim.hidden){skipped.push({objectId:'',reason:'保留锁定或隐藏对象'});return;}
            if(item.typename!=='GroupItem')return;
            var children=[];for(var i=0;i<item.pageItems.length;i++)if(item.pageItems[i].parent===item)children.push(item.pageItems[i]);
            for(i=0;i<children.length;i++)walk(children[i]);
            if(item.clipped||item.opacity!==100||item.blendingMode!==BlendModes.NORMAL){skipped.push({objectId:'',reason:'保留剪切蒙版或带透明度／混合模式的群组'});return;}
            for(i=0;i<children.length;i++){var childLimit=limits(children[i]);if(childLimit.hidden||childLimit.locked){skipped.push({objectId:'',reason:'保留含锁定或隐藏子对象的群组'});return;}}
            plans.push(item);
        }
        for(var i=0;i<refs.length;i++)walk(refs[i].item);
        var count=0,mutated=false;
        try{for(i=0;i<plans.length;i++){var g=plans[i],children=[];for(var j=0;j<g.pageItems.length;j++)if(g.pageItems[j].parent===g)children.push(g.pageItems[j]);children.sort(function(a,b){return b.zOrderPosition-a.zOrderPosition;});for(j=0;j<children.length;j++){children[j].move(g,ElementPlacement.PLACEBEFORE);mutated=true;children[j].selected=true;}g.remove();mutated=true;count++;}
        }catch(e){skipped.push({objectId:'',reason:String(e)});}
        return resultEdit('已取消 '+count+' 层普通群组'+(skipped.length?'；保留蒙版或无法安全解组的对象':''),mutated?['structure']:[],skipped);
    }

    // Explicit productivity commands. No timers, global preferences or source saves.
    function productivityOrder(items,order,tolerance){
        var list=[],rows=[],i,j;
        for(i=0;i<items.length;i++)list.push({item:items[i],box:editorBounds(items[i]),index:i});
        list.sort(function(a,b){var diff=a.box[1]-b.box[1];if(order==='columns')diff=a.box[0]-b.box[0];if(Math.abs(diff)>.01)return diff;return a.index-b.index;});
        for(i=0;i<list.length;i++){var key=list[i].box[1];if(order==='columns')key=list[i].box[0];var row=null;for(j=0;j<rows.length;j++)if(Math.abs(rows[j].key-key)<=tolerance){row=rows[j];break;}if(!row){row={key:key,items:[]};rows.push(row);}row.items.push(list[i]);}
        var out=[];for(i=0;i<rows.length;i++){rows[i].items.sort(function(a,b){var diff=a.box[0]-b.box[0];if(order==='columns')diff=a.box[1]-b.box[1];if(Math.abs(diff)>.01)return diff;return a.index-b.index;});for(j=0;j<rows[i].items.length;j++)out.push(rows[i].items[j].item);}return out;
    }
    function productivityText(items){for(var i=0;i<items.length;i++){var f=items[i];if(f.typename!=='TextFrame'||f.story.textFrames.length!==1)throw Error('请直接选择独立文字框；串接文字需单独处理');if(f.orientation!==TextOrientation.HORIZONTAL)throw Error('暂不支持竖排文字');var m=f.matrix;if(Math.abs(m.mValueB)>.00001||Math.abs(m.mValueC)>.00001||m.mValueA<=0||m.mValueD<=0)throw Error('请先处理旋转、倾斜或反射文字');if(f.characters.length>10000)throw Error('单框文字超过 10000 字符，请分批');}}
    function productivityOverflow(f){
        if(f.kind!==TextType.AREATEXT)throw Error('溢出检查仅支持独立区域文字');
        var end=f.textRange.end,shown=f.textRange.start,n=f.lines.length;
        if(n)shown=f.lines[n-1].end;
        var trailing=String(f.contents).match(/[\r\n]+$/);if(trailing)end-=trailing[0].length;
        return shown<end;
    }
    function productivityRect(p){
        // TextPath has no geometricBounds. Read its actual anchors instead.
        var points=p.pathPoints;if(!p.closed||!points||points.length!==4)return false;
        var anchors=[],left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity,i;
        for(i=0;i<4;i++){var q=points[i],v=q.anchor;if(String(v)!==String(q.leftDirection)||String(v)!==String(q.rightDirection))return false;anchors.push([v[0],v[1]]);left=Math.min(left,v[0]);right=Math.max(right,v[0]);top=Math.max(top,v[1]);bottom=Math.min(bottom,v[1]);}
        if(right-left<=.01||top-bottom<=.01)return false;
        var corners={};for(i=0;i<4;i++){var a=anchors[i],next=anchors[(i+1)%4];if((Math.abs(a[0]-left)>.01&&Math.abs(a[0]-right)>.01)||(Math.abs(a[1]-top)>.01&&Math.abs(a[1]-bottom)>.01))return false;if(Math.abs(a[0]-next[0])>.01&&Math.abs(a[1]-next[1])>.01)return false;var key=(Math.abs(a[0]-left)<.01?'L':'R')+(Math.abs(a[1]-top)<.01?'T':'B');if(corners[key])return false;corners[key]=true;}return true;
    }
    function productivityWritableTree(item){
        var lim=limits(item);if(lim.locked||lim.hidden)throw Error('内容含锁定或隐藏对象，请先明确处理范围');
        var children=item.typename==='GroupItem'?item.pageItems:item.typename==='CompoundPathItem'?item.pathItems:null;
        if(children){var count=children.length;for(var i=0;i<count;i++){var child=children[i];if(child.parent===item)productivityWritableTree(child);}}
    }
    function productivityEnd(frame){var points=frame.insertionPoints,count=points.length;return points[count-1];}
    function productivityBoards(d,indexes){if(!(indexes instanceof Array)||!indexes.length||indexes.length>300)throw Error('请明确勾选 1–300 块目标画板');var seen={},out=[];for(var i=0;i<indexes.length;i++){var n=indexes[i];if(n!==Math.floor(n)||n<0||n>=d.artboards.length||seen[n])throw Error('画板范围无效或重复');seen[n]=true;out.push(n);}return out;}
    function productivityEdit(d,sid,refs,a){
        var items=[],i,j,created=[],changed=0,rows=[],skipped=[],op=a.operation;
        for(i=0;i<refs.length;i++)items.push(refs[i].item);
        var pageSequence=op==='sequence'&&a.target!=='text';
        if(!pageSequence&&(!items.length||items.length>300))throw Error('请选择 1–300 个目标对象，空选区不会处理全文档');
        function finite(n,min,max){if(typeof n!=='number'||!isFinite(n)||n<min||n>max)throw Error('数值超出允许范围');return n;}
        function row(index,status,detail){rows.push({index:index,label:'对象 '+(index+1),status:status,detail:detail});if(status!=='ok')skipped.push({objectId:'s'+index,reason:detail});}
        function answer(message,effects){if(effects&&effects.length)app.redraw();var r=resultEdit(message,effects||[],skipped);r.productivityRows=rows;return r;}
        try{
        if(op==='baseline'){
            productivityText(items);if(items.length<2)throw Error('请选择至少两个点文字');
            for(i=0;i<items.length;i++)if(items[i].kind!==TextType.POINTTEXT||items[i].lines.length!==1)throw Error('基线对齐仅支持单行点文字');
            var baseline=items[0].anchor[1];for(i=1;i<items.length;i++)baseline=Math.min(baseline,items[i].anchor[1]);
            for(i=0;i<items.length;i++){var dy=baseline-items[i].anchor[1];if(Math.abs(dy)>.001){items[i].translate(0,dy);changed++;}}return answer('已按最低文字基线对齐；字符自身基线偏移保持不变',changed?['geometry']:[]);
        }
        if(op==='duplicate-boards'){
            var targets=productivityBoards(d,a.indexes),source=d.artboards.getActiveArtboardIndex(),sb=d.artboards[source].artboardRect;
            if(items.length*targets.length>1000)throw Error('本批复制超过 1000 个对象，请缩小范围');
            for(i=0;i<items.length;i++){if(items[i].parent.typename!=='Layer')throw Error('请选中完整的顶层对象或群组，避免拆散蒙版及群组');}
            items.sort(function(x,y){return x.zOrderPosition-y.zOrderPosition;});
            for(i=0;i<targets.length;i++){if(targets[i]===source)continue;var ab=d.artboards[targets[i]].artboardRect;for(j=0;j<items.length;j++){var copy=items[j].duplicate(items[j],ElementPlacement.PLACEBEFORE);created.push(copy);copy.translate(ab[0]-sb[0],ab[1]-sb[1]);}}
            return answer('已复制 '+created.length+' 个对象到指定画板，保持来源图层与相对叠放',['structure']);
        }
        if(op==='mask-fit'){
            finite(a.anchorX,0,1);finite(a.anchorY,0,1);finite(a.dx,-10000,10000);finite(a.dy,-10000,10000);
            if(!/^(contain|cover|position|width|height|stretch)$/.test(a.mode))throw Error('适配方式无效');
            var maskPlans=[];
            for(i=0;i<items.length;i++){var group=items[i],mask=clippingPath(group),contents=[];if(group.typename!=='GroupItem'||!group.clipped||!mask)throw Error('请选中剪切蒙版群组');for(j=0;j<group.pageItems.length;j++){var child=group.pageItems[j];if(child.parent===group&&child!==mask)contents.push(child);}if(contents.length!==1||!/^(PlacedItem|RasterItem|GroupItem)$/.test(contents[0].typename))throw Error('每个蒙版须含一张图片或一个完整内容群组');var c=contents[0];productivityWritableTree(c);var box=mask.geometricBounds,cb=c.geometricBounds,w=cb[2]-cb[0],h=cb[1]-cb[3];if(w<=0||h<=0)throw Error('蒙版内容尺寸无效');var ratio=1;if(a.mode==='cover')ratio=Math.max((box[2]-box[0])/w,(box[1]-box[3])/h);if(a.mode==='contain')ratio=Math.min((box[2]-box[0])/w,(box[1]-box[3])/h);if(a.mode==='width')ratio=(box[2]-box[0])/w;if(a.mode==='height')ratio=(box[1]-box[3])/h;var rx=ratio,ry=ratio;if(a.mode==='stretch'){rx=(box[2]-box[0])/w;ry=(box[1]-box[3])/h;}finite(rx,.0001,10000);finite(ry,.0001,10000);maskPlans.push({item:c,box:box,rx:rx,ry:ry});}
            for(i=0;i<maskPlans.length;i++){var mp=maskPlans[i],it=mp.item;changed++;if(Math.abs(mp.rx-1)>.000001||Math.abs(mp.ry-1)>.000001)it.resize(mp.rx*100,mp.ry*100,true,true,true,true,Math.sqrt(mp.rx*mp.ry)*100,Transformation.CENTER);var after=it.geometricBounds;it.translate(mp.box[0]+(mp.box[2]-mp.box[0]-(after[2]-after[0]))*a.anchorX-after[0]+a.dx,mp.box[1]-(mp.box[1]-mp.box[3]-(after[1]-after[3]))*a.anchorY-after[1]-a.dy);}
            return answer('已调整 '+changed+' 个蒙版内容；按蒙版外框适配，蒙版路径保持不变',['geometry']);
        }
        if(op==='text-fit'){
            // No source trial writes, temporary documents or AI snapshots. A future
            // native in-memory compositor must prove a fit before enabling writes.
            if(a.mode!=='inspect')throw Error('原生内存排版预检尚未实现，已停止适配；没有试改原稿，也没有创建临时文档');
            productivityText(items);if(items.length>50)throw Error('文字检查每批最多 50 框');
            for(i=0;i<items.length;i++){var f=items[i];if(f.kind!==TextType.AREATEXT){row(i,'skipped','非区域文字，未处理');continue;}
                if(productivityOverflow(f))row(i,'overflow','存在未排出的文字；可容纳字号需等待原生内存排版预检');
                else row(i,'ok','文字完整容纳，无需修改');
            }
            return answer('文字溢出检查：'+rows.length+' 框，'+skipped.length+' 项需处理',[]);
        }
        if(op==='text-merge'){
            productivityText(items);if(items.length<2||items.length>100)throw Error('请选择 2–100 个碎文字框');finite(a.tolerance,0,100);if(typeof a.separator!=='string'||a.separator.length>8)throw Error('分隔符最多 8 字符');
            var parent=items[0].parent,total=0,maxSize=12;
            for(i=0;i<items.length;i++){if(items[i].parent!==parent||parent.typename!=='Layer')throw Error('请选同一图层的顶层文字，不能跨群组或蒙版合并');if(items[i].kind!==TextType.POINTTEXT||items[i].lines.length!==1)throw Error('碎文字合并先支持单行点文字；多行或区域文字请单独处理');total+=items[i].characters.length;for(j=0;j<items[i].characters.length;j++)maxSize=Math.max(maxSize,items[i].characters[j].characterAttributes.size);}
            if(total>10000)throw Error('合并文字超过 10000 字符');
            items=productivityOrder(items,'rows',a.tolerance);var box=unionBounds(items),top=-box[1],height=Math.max(box[3]-box[1]+maxSize*3,maxSize*4);if(!a.removeOriginals)top=-box[3]-20;
            var path=parent.pathItems.rectangle(top,box[0],Math.max(box[2]-box[0]+maxSize*2,50),Math.min(height,16000));created.push(path);var merged=parent.textFrames.areaText(path);created[created.length-1]=merged;merged.name='AIQ 合并文字';merged.move(items[0],ElementPlacement.PLACEBEFORE);
            var lastY=editorBounds(items[0])[1];
            for(i=0;i<items.length;i++){var y=editorBounds(items[i])[1];if(i){var sep=a.separator;if(Math.abs(y-lastY)>a.tolerance){sep='\r';lastY=y;}if(sep)productivityEnd(merged).characters.add(sep);}items[i].textRange.duplicate(productivityEnd(merged),ElementPlacement.PLACEAFTER);}
            app.redraw();for(var grow=0;grow<12&&productivityOverflow(merged)&&merged.textPath.height<16000;grow++){merged.textPath.height=Math.min(16000,merged.textPath.height*1.5);merged.textPath.top=top;app.redraw();}
            if(productivityOverflow(merged))throw Error('合并结果仍有溢出，未删除原文字');
            if(a.removeOriginals){for(i=0;i<items.length;i++){items[i].remove();changed++;}}
            return answer('已按行合并并保留字符样式'+(a.removeOriginals?'，替换原碎文字':'；原文字保留，新框位于下方'),['text-merge']);
        }
        if(op==='sequence'){
            if(!(a.values instanceof Array)||!a.values.length||a.values.length>300)throw Error('编号数量无效');for(i=0;i<a.values.length;i++)if(typeof a.values[i]!=='string'||!a.values[i].length||a.values[i].length>160)throw Error('编号内容无效');
            if(a.target==='text'){
                productivityText(items);items=productivityOrder(items,a.order,3);if(items.length!==a.values.length)throw Error('编号数量必须与所选文字框数量相同');
                if(typeof a.placeholder!=='string'||!a.placeholder.length)throw Error('请输入需要替换的编号占位符');var replacements=[];
                for(i=0;i<items.length;i++){var content=String(items[i].contents),at=content.indexOf(a.placeholder);if(at<0||content.indexOf(a.placeholder,at+a.placeholder.length)>=0)throw Error('每个文字框须恰好包含一个占位符；本批未写入');variableRange(items[i],at,at+a.placeholder.length);replacements.push({frame:items[i],start:at});}
                for(i=0;i<replacements.length;i++){var rp=replacements[i];changed++;variableText(rp.frame,{placeholder:a.placeholder,style:'template'},{text:a.values[i]},d,d,rp.start);}
            }else{
                var indexes=productivityBoards(d,a.indexes);if(indexes.length!==a.values.length)throw Error('编号数量须与目标画板数量相同');finite(a.offsetX,-16000,16000);finite(a.offsetY,-16000,16000);finite(a.fontSize,1,1296);
                if(a.target!=='pages'&&a.target!=='board-names')throw Error('编号用途无效');
                if(a.target==='pages'&&(d.activeLayer.locked||!d.activeLayer.visible))throw Error('当前图层锁定或隐藏');
                for(i=0;i<indexes.length;i++){var board=d.artboards[indexes[i]];if(a.target==='board-names'){board.name=a.values[i];changed++;}else{var label=d.activeLayer.textFrames.add();created.push(label);label.contents=a.values[i];label.textRange.characterAttributes.size=a.fontSize;label.position=[board.artboardRect[0]+a.offsetX,board.artboardRect[1]-a.offsetY];label.name='AIQ 页码｜'+a.values[i];}}
            }
            return answer('已应用 '+a.values.length+' 个编号',['numbering']);
        }
        if(op==='barcode'){
            finite(a.moduleWidth,72/25.4*.2,20);finite(a.height,10,2000);items=productivityOrder(items,a.order,3);
            if(!(a.labels instanceof Array)||items.length!==a.labels.length||items.length>100)throw Error('条码数量须与所选定位对象一致，最多 100 个');
            for(i=0;i<a.labels.length;i++){var code=a.labels[i];if(typeof code.text!=='string'||!code.text.length||code.text.length>100||!(code.bars instanceof Array)||!code.bars.length||code.bars.length>1000)throw Error('条码数据无效');finite(code.width,1,5000);for(j=0;j<code.bars.length;j++){var bar=code.bars[j];finite(bar[0],0,code.width);finite(bar[1],.1,code.width);if(bar[0]+bar[1]>code.width+.001)throw Error('条码边界无效');}}
            for(i=0;i<a.labels.length;i++){var bc=a.labels[i],bb=items[i].geometricBounds,g=items[i].parent.groupItems.add();created.push(g);g.move(items[i],ElementPlacement.PLACEBEFORE);g.name='AIQ 条码｜'+bc.text;var left=bb[0],top=bb[3]-12,quiet=12*a.moduleWidth;
                var white=new CMYKColor();white.cyan=white.magenta=white.yellow=white.black=0;var black=new CMYKColor();black.cyan=black.magenta=black.yellow=0;black.black=100;
                var bg=g.pathItems.rectangle(top,left,bc.width*a.moduleWidth+quiet*2,a.height+18);bg.stroked=false;bg.filled=true;bg.fillColor=white;bg.fillOverprint=false;
                for(j=0;j<bc.bars.length;j++){var r=g.pathItems.rectangle(top-2,left+quiet+bc.bars[j][0]*a.moduleWidth,bc.bars[j][1]*a.moduleWidth,a.height-2);r.stroked=false;r.filled=true;r.fillColor=black;r.fillOverprint=false;}
                var caption=g.textFrames.add();caption.contents=bc.text;caption.textRange.characterAttributes.size=9;caption.textRange.characterAttributes.fillColor=black;caption.position=[left+quiet,top-a.height-3];
            }
            return answer('已在 '+created.length+' 个定位对象下方生成条码；原对象保留',['barcode']);
        }
        if(op==='photoshop'){
            if(items.length>20)throw Error('图片往返每批最多 20 张');var files=[],unique={};
            for(i=0;i<items.length;i++){var image=items[i];if(image.typename!=='PlacedItem')throw Error('请直接选择链接图片；嵌入图请先在原生链接面板取消嵌入');var file=image.file;if(!file||!file.exists||!/\.(psd|psb|png|jpe?g|tiff?)$/i.test(file.name))throw Error('链接图片缺失或格式不支持');if(!unique[file.fsName]){unique[file.fsName]=true;files.push(file.fsName);}}
            if(a.mode==='open'){
                if(typeof BridgeTalk==='undefined')throw Error('未发现可用的 Photoshop');var target=BridgeTalk.getSpecifier('photoshop');if(!target)throw Error('未发现可用的 Photoshop');
                var bt=new BridgeTalk(),reply=null,psError=false;bt.target=target;bt.timeout=20;
                // Explicit request only. No focus-stealing call, polling or automatic saves.
                // BridgeTalk rewrites escaped backslashes in its source body.
                // File accepts forward slashes on Windows; keep paths unambiguous.
                var psPaths=[];for(i=0;i<files.length;i++)psPaths.push(files[i].replace(/\\/g,'/'));
                bt.body='(function(){var paths='+stringify(psPaths)+';for(var i=0;i<paths.length;i++){app.open(new File(paths[i]));}return "AIQ_OPENED:"+paths.length;})()';
                bt.onResult=function(message){reply=String(message.body);};bt.onError=function(){psError=true;};bt.send(20);
                if(psError)throw Error('Photoshop 打开图片失败，可能已有部分图片打开；请检查 PS');
                if(reply!=='AIQ_OPENED:'+files.length)throw Error('尚未收到 Photoshop 打开确认；请求可能仍在处理中，请先检查 PS，勿重复发送');
                return answer('Photoshop 已确认打开 '+files.length+' 张图片；编辑保存后点击更新');
            }
            if(a.mode!=='update')throw Error('图片往返操作无效');
            for(i=0;i<items.length;i++){var img=items[i],matrix=img.matrix,mb=[matrix.mValueA,matrix.mValueB,matrix.mValueC,matrix.mValueD,matrix.mValueTX,matrix.mValueTY];img.relink(img.file);changed++;var nm=img.matrix,nb=[nm.mValueA,nm.mValueB,nm.mValueC,nm.mValueD,nm.mValueTX,nm.mValueTY];for(j=0;j<6;j++)if(Math.abs(mb[j]-nb[j])>.01)throw Error('链接已更新但变换发生变化，请撤销并检查图片尺寸');}
            return answer('已更新 '+changed+' 张图片；保留链接变换，PS 如改像素尺寸请核对外框',['links']);
        }
        throw Error('未知生产辅助操作');
        }catch(error){
            if(!changed){for(i=created.length-1;i>=0;i--)try{created[i].remove();}catch(cleanupError){changed++;}}
            if(changed||created.length){return {status:'failed',selectedObjectIds:[],skipped:skipped,sideEffects:['partial-write'],error:{code:'HOST_SCRIPT_ERROR',message:String(error.message||error)+'；请检查结果，必要时使用 Illustrator 撤销'}};}
            throw error;
        }
    }

    var capturedStyle=null;
    function styleTransfer(d,refs,a){
        var labels={fill:'填充',fillColor:'填充颜色',stroke:'描边',strokeColor:'描边颜色',strokeWidth:'描边粗细（pt）',width:'宽度（等比）',size:'整体大小（pt）',textStyle:'文字样式',fontSize:'字符大小（pt）',fontHeight:'字符高度（%）',textFrameSize:'文字框大小（pt）'};
        function summary(v){if(v&&v.kind)return v.kind==='spot'?'专色 '+v.name+' · '+v.tint+'%':v.kind.toUpperCase()+(v.values?' '+v.values.join(' / '):'');if(v instanceof Array)return v.join(' × ');if(typeof v==='object')return v.font+' · 字距 '+v.tracking;if(v===true)return '开启';if(v===false)return '关闭';return String(v);}
        function field(row,key,fn){try{var value=fn();if(value===undefined||value===null)throw Error('不可读取');row.values[key]=value;row.display.fields.push({key:key,label:labels[key],value:summary(value)});}catch(unreadable){row.display.warnings.push(labels[key]+'：'+String(unreadable.message||unreadable));}}
        function attrs(c,key){if(key==='fontSize')return c.size;if(key==='fontHeight')return c.verticalScale;if(key==='fillColor')return textFillValue(c.fillColor);if(key==='strokeColor')return textFillValue(c.strokeColor);if(key==='strokeWidth')return c.strokeWeight;return {font:String(c.textFont.name),tracking:c.tracking,leading:c.leading,autoLeading:c.autoLeading,baselineShift:c.baselineShift,horizontalScale:c.horizontalScale};}
        function textValue(range,key){if(!range.length)throw Error('空文字没有字符样式');var first=attrs(range.characters[0].characterAttributes,key),stamp=stringify(first);for(var i=1;i<range.length;i++)if(stringify(attrs(range.characters[i].characterAttributes,key))!==stamp)throw Error('混合值，请吸取同样式文字片段');return first;}
        function sample(item,depth,range){
            var index=capturedStyle.rows.length;if(index>=300)throw Error('样式吸取最多 300 个对象，请缩小范围');
            var row={item:item,parent:item.parent,stamp:displayStamp(item),values:{},display:{index:index,name:item.name||'对象 '+(index+1),kind:item.typename,depth:depth,fields:[],warnings:[]}};
            capturedStyle.rows.push(row);var b=item.geometricBounds,w=b[2]-b[0],h=b[1]-b[3];
            field(row,'width',function(){return w;});field(row,'size',function(){return [w,h];});
            var path=item;if(item.typename==='CompoundPathItem'){if(!item.pathItems.length)throw Error('空复合路径');path=item.pathItems[0];}
            if(path.typename==='PathItem'){
                field(row,'fill',function(){return path.filled;});field(row,'fillColor',function(){return textFillValue(path.fillColor);});field(row,'stroke',function(){return path.stroked;});field(row,'strokeColor',function(){return textFillValue(path.strokeColor);});field(row,'strokeWidth',function(){return path.strokeWidth;});
            }else if(item.typename==='TextFrame'){
                range=range||item.textRange;if(range.length>5000)throw Error('文字样式吸取最多 5000 字，请选同样式片段');
                var keys=['textStyle','fontSize','fontHeight','fillColor','strokeColor','strokeWidth'];
                for(var k=0;k<keys.length;k++)(function(key){field(row,key,function(){return textValue(range,key);});})(keys[k]);
                if(item.kind===TextType.AREATEXT)field(row,'textFrameSize',function(){var t=item.textPath.geometricBounds;return [t[2]-t[0],t[1]-t[3]];});
            }else if(item.typename==='GroupItem'){
                for(var i=0;i<item.pageItems.length;i++)if(item.pageItems[i].parent===item)sample(item.pageItems[i],depth+1,null);
            }else row.display.warnings.push('图像／特殊对象仅支持几何尺寸；填描请选外框路径。');
            return row;
        }
        if(a.operation==='capture'){
            if(refs.length!==1)throw Error('请选择一个来源对象，多个对象请先编组');
            capturedStyle={sid:session(d),token:'style-'+(++serial),rows:[]};
            try{sample(refs[0].item,0,selectedTextRange(d));}catch(captureError){capturedStyle=null;throw captureError;}
            var result=resultEdit('已吸取 '+capturedStyle.rows.length+' 项对象样式');result.styleSample={token:capturedStyle.token,docSessionId:capturedStyle.sid,rows:[]};
            for(var n=0;n<capturedStyle.rows.length;n++)result.styleSample.rows.push(capturedStyle.rows[n].display);return result;
        }
        if(!capturedStyle||capturedStyle.sid!==session(d)||capturedStyle.token!==a.sampleToken)throw Error('样式来源已失效，请重新吸取');
        if(typeof a.row!=='number'||a.row%1||a.row<0||a.row>=capturedStyle.rows.length)throw Error('请选择有效的来源对象');
        var source=capturedStyle.rows[a.row];
        if(a.operation==='locate'){
            if(source.item.parent!==source.parent||displayStamp(source.item)!==source.stamp)throw Error('来源对象已改变或删除，请重新吸取');
            var guard=limits(source.item);if(guard.locked||guard.hidden)throw Error('来源对象隐藏或锁定，不能定位');
            d.selection=null;source.item.selected=true;app.redraw();return resultEdit('已在画布选中来源对象',['selection']);
        }
        if(a.operation!=='apply')throw Error('未知样式操作');
        if(!(a.fields instanceof Array)||!a.fields.length||a.fields.length>11)throw Error('请选择要赋予的属性');
        var fields=a.fields.slice(0),geometry=false,seen={},i,j;fields.sort(function(l,r){return (l==='fill'||l==='stroke'?1:0)-(r==='fill'||r==='stroke'?1:0);});
        for(i=0;i<fields.length;i++){var key=fields[i];if(!labels[key]||source.values[key]===undefined||seen[key])throw Error('来源不包含该属性或重复属性');seen[key]=true;if(key==='width'||key==='size'||key==='textFrameSize'){if(geometry)throw Error('大小、宽度和文字框大小只能选一项');geometry=true;}}
        if(!refs.length)throw Error('请选择目标对象，空选区不扩大范围');
        var targets=[],skipped=[];
        function collect(item){if(targets.length>=300)throw Error('单次赋予最多 300 个对象');if(item.typename==='GroupItem'&&!geometry){for(var k=0;k<item.pageItems.length;k++)if(item.pageItems[k].parent===item)collect(item.pageItems[k]);}else targets.push(item);}
        for(i=0;i<refs.length;i++)collect(refs[i].item);
        var plans=[],partial=selectedTextRange(d);
        for(i=0;i<targets.length;i++){
            var target=targets[i],lim=limits(target),p=target,values={},applicable=[];
            if(lim.locked||lim.hidden){skipped.push({objectId:'target-'+i,reason:'目标隐藏或锁定'});continue;}
            if(target.typename==='CompoundPathItem'&&target.pathItems.length)p=target.pathItems[0];
            for(j=0;j<fields.length;j++){
                var f=fields[j],text=target.typename==='TextFrame',supported=false;
                if(f==='size'||f==='width')supported=true;
                else if(text){if(f==='textFrameSize')supported=target.kind===TextType.AREATEXT;else supported=/^(textStyle|fontSize|fontHeight|fillColor|strokeColor|strokeWidth)$/.test(f);}
                else if(p.typename==='PathItem')supported=/^(fill|fillColor|stroke|strokeColor|strokeWidth)$/.test(f);
                if(partial&&/^(width|size|textFrameSize)$/.test(f))throw Error('局部文字不能赋予整体尺寸，请选择完整文本框');
                if(!supported){skipped.push({objectId:'target-'+i,reason:labels[f]+'不适用于 '+target.typename});continue;}
                values[f]=source.values[f];if(f==='fillColor'||f==='strokeColor')values[f]=textFillNative(d,values[f]);
                if(f==='textStyle'){values.font=app.textFonts.getByName(values[f].font);}
                if(f==='size'||f==='width'||f==='textFrameSize'){var box=(f==='textFrameSize'?target.textPath:target).geometricBounds;if(box[2]<=box[0]||box[1]<=box[3]||source.values[f] instanceof Array&&(source.values[f][0]<=0||source.values[f][1]<=0))throw Error('不能给零尺寸对象赋予大小');}
                applicable.push(f);
            }
            if(applicable.length)plans.push({item:target,path:p,range:target.typename==='TextFrame'?(partial||target.textRange):null,values:values,fields:applicable});
        }
        if(!plans.length)throw Error('目标不支持所选属性：'+targets.length+' 项；'+stringify(skipped));
        var changed=0;
        for(i=0;i<plans.length;i++){
            var plan=plans[i];try{
                for(j=0;j<plan.fields.length;j++){
                    var f=plan.fields[j],value=plan.values[f],item=plan.item,isText=item.typename==='TextFrame',attributes=isText?plan.range.characterAttributes:null;
                    if(f==='size'||f==='width'||f==='textFrameSize'){var shape=f==='textFrameSize'?item.textPath:item,b=shape.geometricBounds,sx=(f==='width'?value:value[0])/(b[2]-b[0])*100,sy=f==='width'?sx:value[1]/(b[1]-b[3])*100;shape.resize(sx,sy,true,true,true,true,100,Transformation.CENTER);}
                    else if(f==='textStyle'){attributes.textFont=plan.values.font;attributes.tracking=value.tracking;attributes.autoLeading=value.autoLeading;if(!value.autoLeading)attributes.leading=value.leading;attributes.baselineShift=value.baselineShift;attributes.horizontalScale=value.horizontalScale;}
                    else if(f==='fontSize')attributes.size=value;
                    else if(f==='fontHeight')attributes.verticalScale=value;
                    else if(f==='fillColor'){if(isText)attributes.fillColor=value;else plan.path.fillColor=value;}
                    else if(f==='strokeColor'){if(isText)attributes.strokeColor=value;else plan.path.strokeColor=value;}
                    else if(f==='strokeWidth'){if(isText)attributes.strokeWeight=value;else plan.path.strokeWidth=value;}
                    else if(f==='fill')plan.path.filled=value;
                    else if(f==='stroke')plan.path.stroked=value;
                }changed++;
            }catch(writeError){skipped.push({objectId:'target-'+i,reason:'部分属性可能已写入：'+String(writeError.message||writeError)});}
        }
        geometryUndo=null;return resultEdit('已赋予 '+changed+' 个对象'+(skipped.length?'；部分属性未完成':''),['object-style'],skipped);
    }
    function editDocument(p){
        var d=wakeActive();if(!d){return failed('NO_DOCUMENT','Illustrator 中没有打开的文档');}
        var sid=session(d),a=p.action||{},cache=null,i,j,changed=0;pruneEditor(sid);
        if(p.docSessionId!==sid){return failed('DOC_SESSION_MISMATCH','文档已切换，请重新读取');}
        for(i=0;i<editorTokens.length;i++){if(editorTokens[i].token===p.token&&editorTokens[i].sid===sid){cache=editorTokens[i];}}
        if(!cache){return failed('REF_STALE','属性记录已过期，请刷新后重试');}
        try {
            if(a.type==='symmetry'&&(symmetrySession||a.phase==='cancel'||a.phase==='commit')){return symmetryEdit(d,sid,[],a);}
            if(symmetrySession&&a.type!=='symmetry'){throw Error('请先保留或取消当前对称预览');}
            var refs=cache.refs,selected=[];
            var documentAction=(a.type==='style-transfer'&&a.operation==='locate')||a.type==='package'||a.type==='sample-text-style'||a.type==='variable-data'||a.type==='open-folder'||a.type==='read-bleed'||a.type==='set-bleed'||a.type==='fonts'||a.type==='text-search'||a.type==='object-search'||(a.type==='outlines'&&a.scope==='document')||(a.type==='annotate'&&a.target==='artboards')||a.type==='save'||(a.type==='export'&&a.target!=='objects')||a.type==='choose-folder'||a.type==='rename-artboards'||a.type==='artboards-update'||(a.type==='layers'&&(a.source!=='selection'||a.operation==='update'||a.operation==='list'))||(a.type==='artboard'&&a.operation!=='fit'&&a.operation!=='from-selection')||a.type==='color-mode';
            var partialRange=selectedTextRange(d);
            if(partialRange&&!documentAction&&a.type!=='style-transfer'&&a.type!=='text-list'&&a.type!=='text-format'&&a.type!=='text-case'&&a.type!=='properties'&&a.type!=='pick-color'&&a.type!=='native'){throw Error('当前选中部分文字，请退出文字编辑并选择完整对象后操作');}
            if(partialRange&&(a.type==='properties'||a.type==='pick-color'||a.type==='style-transfer')&&cache.textKey!==textSelectionStamp(d)){throw Error('文字选区已改变，请重新读取');}
            if(!documentAction){selected=selectedItems(d);}
            if(!documentAction){if(selected.length!==refs.length){throw Error('选区已改变（'+refs.length+' → '+selected.length+'），请重新选择后重试');}
            for(i=0;i<refs.length;i++){if(refs[i].item!==selected[i]){throw Error('选区已改变，请重新读取');}}
            // Geometry uses current root identity, parent, bounds and editability in this synchronous call.
            // Deep content signatures remain required for retained sources and content-sensitive actions.
            var prepared=[];for(i=0;i<refs.length;i++){var r=refs[i];if(r.item.parent!==r.parent||displayStamp(r.item)!==r.stamp){throw Error('对象已改变或失效，请重新读取');}prepared.push({item:r.item,parent:r.parent,signature:a.type==='native-align'||a.type==='measure-layout'||a.type==='geometry'?null:editSignature(r.item)});}refs=prepared;
            if(a.type==='native-align'||a.type==='measure-layout'||a.type==='geometry'){for(i=0;i<refs.length;i++){var boundaryLimits=limits(refs[i].item);if(boundaryLimits.locked||boundaryLimits.hidden)throw Error('对象已锁定或隐藏，请重新选择');}}else validRefs(refs);}
            if(a.type==='productivity'){if(cache.unit!==documentUnit(d))throw Error('文档单位已改变，请重新读取');if((a.operation==='duplicate-boards'||a.operation==='sequence'&&a.target!=='text')&&boardStamp(d)!==cache.artboards)throw Error('画板已改变，请重新读取');return productivityEdit(d,sid,refs,a);}
            if(a.type==='variable-data'){if(a.operation==='capture')return variableCapture(d,refs,a,cache);if(a.operation==='bind-selection')return variableBindSelection(d,a);if(a.operation==='images')return variableImages(a);return variableGenerate(a);}
            if(a.type==='measure-layout'){return measureLayout(d,refs,a);}
            if(a.type==='smart-group'){if(!groupingVerified||String(app.version)!=='30.0.0')throw Error('智能群组尚未通过宿主验证');return a.groups?smartGroup(d,cache,refs,a.groups):smartRegions(d,cache,refs);}
            if(a.type==='ungroup-all'){if(!groupingVerified||String(app.version)!=='30.0.0')throw Error('全部取消群组尚未通过宿主验证');return ungroupAll(d,refs);}
            if(a.type==='native-align'){return nativeAlign(d,refs,a);}
            if(a.type==='artboards-update'){return updateArtboards(d,cache,a);}
            if(a.type==='layers'){return editLayers(d,refs,cache,a);}
            if(a.type==='style-transfer'){return styleTransfer(d,refs,a);}
            if(a.type==='sample-text-style'){return sampleEditorTextStyle(d,a);}
            if(a.type==='set-bleed'){return setDocumentBleed(d,a);}
            if(a.type==='read-bleed'){var rb=resultEdit('已读取当前文档四边出血');rb.bleedOffsets=documentBleed(d);if(lastBleedReadMethod==='saved-file')rb.message='已读取文档四边出血（已保存文件）';return rb;}
            if(a.type==='open-folder'){var openDir=new Folder(a.folder||'');if(!a.folder||!openDir.exists)throw Error('目录不存在，请先选择或完成导出');if(!openDir.execute())throw Error('系统无法打开此目录');var opened=resultEdit('已打开导出目录');opened.folder=openDir.fsName;return opened;}
            if(a.type==='choose-folder'){var chosen=Folder.selectDialog('选择输出文件夹');var chosenResult=resultEdit(chosen?'已设置项目目录':'已取消');if(chosen){chosenResult.folder=chosen.fsName;}return chosenResult;}
            if(a.type==='save'){
                if(a.nativeDialog){if(!nativeSaveAsVerified||String(app.version)!=='30.0.0')throw Error('原生另存为等待本轮实机验证');var priorInteraction=app.userInteractionLevel;try{app.userInteractionLevel=UserInteractionLevel.DISPLAYALERTS;app.executeMenuCommand('saveas');}finally{app.userInteractionLevel=priorInteraction;}return resultEdit('原生另存为流程已返回；保存或取消以 Illustrator 对话框为准',['document-state']);}
                var file=null,saveFormat=a.format||'ai',saveOptions=null;try{if(!a.saveAs){file=d.fullName;}}catch(noPath){}
                if(file){d.save();return resultEdit('已保存 '+decodeURI(file.name),['save']);}
                if(!/^(ai|pdf|eps|ait|svg|svgz)$/.test(saveFormat)){throw Error('不支持的另存为格式');}
                if(a.saveAs&&a.folder&&a.fileName){var safeName2=String(a.fileName).replace(/\.(ai|pdf|eps|ait|svgz?)$/i,'');if(!safeName2||safeName2.length>200||/^[ .]|[ .]$|[<>:"\/\\|?*\x00-\x1f]/.test(safeName2)){throw Error('文件名无效');}if(saveFormat==='svg'||saveFormat==='svgz'){safeName2=safeName2.replace(/ /g,'-');}var saveDir=new Folder(a.folder);if(!saveDir.exists){throw Error('保存目录不存在');}file=new File(saveDir.fullName+'/'+encodeURIComponent(safeName2+'.'+saveFormat));if(file.exists){throw Error('目标文件已存在，请使用其他名称');}}
                else{file=File.saveDialog('另存为 Illustrator 文档','Illustrator:*.ai');if(!file){return resultEdit('已取消保存');}if(!/\.ai$/i.test(file.name)){file=new File(file.fsName+'.ai');}saveFormat='ai';}
                if(session(active())!==sid){throw Error('文档已切换，取消保存');}
                if(saveFormat==='ait'){var saveInteraction=app.userInteractionLevel;try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;d.saveNoUI(file);}finally{app.userInteractionLevel=saveInteraction;}}
                else if(saveFormat==='ai'){saveOptions=new IllustratorSaveOptions();saveOptions.pdfCompatible=true;d.saveAs(file,saveOptions);}
                else if(saveFormat==='pdf'){saveOptions=new PDFSaveOptions();saveOptions.preserveEditability=true;d.saveAs(file,saveOptions);}
                else if(saveFormat==='eps'){saveOptions=new EPSSaveOptions();saveOptions.saveMultipleArtboards=false;d.saveAs(file,saveOptions);}
                else{saveOptions=new ExportOptionsSVG();saveOptions.compressed=saveFormat==='svgz';saveOptions.embedRasterImages=true;d.exportFile(file,ExportType.SVG,saveOptions);}
                if(!file.exists||file.length===0){throw Error('未发现有效保存文件，请检查输出目录');}
                return resultEdit(saveFormat==='svg'||saveFormat==='svgz'?'已保存 SVG 副本，当前文档仍保留原路径':'已另存为 '+decodeURI(file.name),['save']);
            }
            if(a.type==='capture-targets'){if(a.role==='clear'){delete replacementBySession[sid];replacement=null;return resultEdit('已清除来源');}if(!refs.length){throw Error('请先选择要被替换的对象 A');}if(a.role==='source'&&refs.length!==1){throw Error('请选择一个来源 B，多个图形请先编组');}if(a.role==='source'){for(i=0;i<refs.length;i++)refs[i].sourceSignature=replacementSourceSignature(refs[i].item);}replacement={sid:sid,refs:refs,role:a.role||'targets'};replacementBySession[sid]=replacement;return resultEdit(a.role==='source'?'已记住来源 B，请在画布选择目标 A':'已记住 '+refs.length+' 个目标，请选择来源 B');}
            if(a.type==='color-mode'){
                if(a.mode!=='rgb'&&a.mode!=='cmyk'){throw Error('颜色模式只支持 RGB 或 CMYK');}
                var wantCmyk=a.mode==='cmyk',isCmyk=d.documentColorSpace===DocumentColorSpace.CMYK;
                if(isCmyk===wantCmyk){return resultEdit('文档已经是 '+(wantCmyk?'CMYK':'RGB')+' 模式');}
                // executeMenuCommand 只派发命令，实际转换在本次脚本让出后由主循环完成；
                // 脚本内轮询等不到结果，还会在引擎上下文切换窗口抛“没有文档”。
                // 派发后立即返回，靠面板的自动刷新读取实际颜色空间为准。
                try{app.executeMenuCommand(wantCmyk?'doc-color-cmyk':'doc-color-rgb');}catch(menuDispatch){}
                // 全文档颜色将被重新计算：旧选区签名与几何恢复记录全部失效。
                clearEditorTokens();geometryUndo=null;delete replacementBySession[sid];replacement=null;
                return resultEdit('已发起转换为 '+(wantCmyk?'CMYK':'RGB')+'，稍候自动刷新确认',['color-mode']);
            }
            if(a.type==='artboard'){
                var boards=[];for(i=0;i<d.artboards.length;i++){boards.push({index:i,name:d.artboards[i].name,bounds:bounds(d.artboards[i].artboardRect)});}if(stringify(boards)!==cache.artboards){throw Error('画板已改变，请重新读取');}
                if(a.index<0||a.index>=d.artboards.length||a.index%1!==0){throw Error('画板不存在');}var ab=d.artboards[a.index],rect=ab.artboardRect;
                if(a.operation==='activate'){d.artboards.setActiveArtboardIndex(a.index);return resultEdit('已切换画板',['artboard-active']);}
                if(a.operation==='from-selection'){
                    if(!refs.length)throw Error('请选择对象，空选区不会创建整文档画板');
                    if(a.boundsMode!=='frame'&&a.boundsMode!=='overall'&&a.boundsMode!=='visible')throw Error('创建边界模式无效');
                    var measuredBox=null;if(a.boundsMode==='overall'){measuredBox=unionBounds(selected);}else{var measureResult=measureLayout(d,refs,{clip:a.boundsMode,text:'frame'});for(var mi=0;mi<measureResult.measuredObjects.length;mi++)measuredBox=mergeBox(measuredBox,measureResult.measuredObjects[mi].bounds);}
                    var margin=a.margin===undefined?0:a.margin;if(!isFinite(margin)||margin<0)throw Error('留边须为非负数');positive(measuredBox[2]-measuredBox[0]+2*margin);positive(measuredBox[3]-measuredBox[1]+2*margin);ab=d.artboards.add([measuredBox[0]-margin,-measuredBox[1]+margin,measuredBox[2]+margin,-measuredBox[3]-margin]);d.artboards.setActiveArtboardIndex(d.artboards.length-1);
                }
                else if(a.operation==='fit'){var ub=unionBounds(selected);if(!ub){throw Error('请先选择对象，空选区不会改成全文档');}var m=a.margin||0;if(!isFinite(m)||m<0){throw Error('留边必须为非负数');}positive(ub[2]-ub[0]+m*2);positive(ub[3]-ub[1]+m*2);ab.artboardRect=[ub[0]-m,-ub[1]+m,ub[2]+m,-ub[3]-m];}
                else if(a.operation==='resize'||a.operation==='add'){var w=positive(a.width),h=positive(a.height);if(a.operation==='add'){ab=d.artboards.add([rect[2]+20,rect[1],rect[2]+20+w,rect[1]-h]);}else{var cx=(rect[0]+rect[2])/2,cy=(rect[1]+rect[3])/2;ab.artboardRect=[cx-w/2,cy+h/2,cx+w/2,cy-h/2];}}
                else{throw Error('未知画板操作');}if(a.name){ab.name=a.name;}geometryUndo=null;return resultEdit('画板已更新',['artboard']);
            }
            if(a.type==='package'){return packageDelivery(d,cache,a);}
            if(a.type==='export'){var exported=a.target?exportDelivery(d,refs,cache,a):exportEditor(d,sid,a);if(a.openFolderAfterExport&&exported.files&&exported.files.length&&exported.folder){try{if(!new Folder(exported.folder).execute()){exported.message+='；文件已导出，但无法打开目录';}}catch(openError){exported.message+='；文件已导出，但无法打开目录';}}return exported;}
            if(a.type==='rename-artboards'){return renameBoards(d,cache,a);}
            if(a.type==='annotate'){return annotateDocument(d,refs,cache,a);}
            if(a.type==='annotate-remove'){return annotateRemove(d,refs,a);}
            if(a.type==='path-length'){return pathLengthMeasure(d,refs,cache,a);}
            if(a.type==='native'){return runNative(d,refs,a);}
            if(a.type==='text-case'){return textCase(d,cache,a);}
            if(a.type==='fonts'){fontListCache=null;return listEditorFonts();}
            if(a.type==='text-list'){return paragraphList(d,cache,refs,a);}
            if(a.type==='text-format'){return formatText(d,cache,refs,a);}
            if(a.type==='object-search'){return searchEditorObjects(d,sid,a);}
            if(a.type==='text-search'){return searchEditorText(d,sid,cache,a);}
            if(a.type==='outlines'){return outlineEditorText(d,refs,a);}
            if(!refs.length){throw Error('请先选择对象；不会扩大到全文档');}
            if(a.type==='symmetry'){geometryUndo=null;return symmetryEdit(d,sid,refs,a);}
            if(a.type==='geometry'){
                if(!(a.transforms instanceof Array)||!a.transforms.length){throw Error('没有尺寸目标');}var plans=[],seen={};
                for(i=0;i<a.transforms.length;i++){var t=a.transforms[i],ix=Number(String(t.id).slice(1));if(t.id!=='s'+ix||!refs[ix]||seen[t.id]){throw Error('尺寸目标无效');}seen[t.id]=true;var tb=t.bounds;if(!(tb instanceof Array)||tb.length!==4){throw Error('无效边界');}for(j=0;j<4;j++){if(!isFinite(tb[j])){throw Error('无效坐标');}}positive(tb[2]-tb[0]);positive(tb[3]-tb[1]);var it=refs[ix].item;if(it.typename==='PathItem'&&it.clipping){throw Error('蒙版路径不能单独缩放');}if(['PathItem','TextFrame','GroupItem','CompoundPathItem','PlacedItem','RasterItem'].join('|').indexOf(it.typename)<0){throw Error('选区包含不支持变换的对象');}var sourceBounds=editorBounds(it);positive(sourceBounds[2]-sourceBounds[0]);positive(sourceBounds[3]-sourceBounds[1]);plans.push({item:it,bounds:tb});}
                geometryUndo=null;var undoItems=[],allPaths=!a.scaleStrokes;for(i=0;i<plans.length;i++){if(plans[i].item.typename!=='PathItem'){allPaths=false;}else{undoItems.push({item:plans[i].item,parent:plans[i].item.parent,before:pathGeometry(plans[i].item)});}}for(i=0;i<plans.length;i++){changed++;setItemBounds(plans[i].item,plans[i].bounds,a.scaleStrokes===true);}if(allPaths){for(i=0;i<undoItems.length;i++){undoItems[i].after=pathGeometry(undoItems[i].item);}geometryUndo={sid:sid,items:undoItems};}app.redraw();for(i=0;i<plans.length;i++){var actual=editorBounds(plans[i].item);for(j=0;j<4;j++){if(Math.abs(actual[j]-plans[i].bounds[j])>0.1){throw Error('实际尺寸或位置未达到目标');}}}var geometryResult=resultEdit('已调整 '+plans.length+' 个对象',['geometry']);geometryResult.undoable=allPaths;return geometryResult;
            }
            if(a.type==='pick-color'){
                if(a.target!=='fill'&&a.target!=='stroke'){throw Error('颜色目标无效');}
                var initial=d.documentColorSpace===DocumentColorSpace.CMYK?new CMYKColor():makeColor('#808080');
                try{var first=refs[0].item;initial=first.typename==='TextFrame'?first.characters[0].characterAttributes[a.target+'Color']:first[a.target+'Color'];if(initial.typename==='NoColor'){initial=makeColor('#808080');}}catch(noInitial){}
                var initialColorKey=stringify(color(initial)),picked=app.showColorPicker(initial);if(!picked||!picked.typename||stringify(color(picked))===initialColorKey){return resultEdit('颜色未改变，未应用');}validRefs(refs);
                var colorSkipped=[];for(i=0;i<refs.length;i++){var colored=refs[i].item;if(colored.typename==='TextFrame'){var colorChars=partialRange?partialRange.characters:colored.characters;for(j=0;j<colorChars.length;j++){colorChars[j].characterAttributes[a.target+'Color']=picked;}changed++;}
                    else if(colored.typename==='PathItem'&&!colored.clipping){colored[a.target==='fill'?'filled':'stroked']=true;colored[a.target+'Color']=picked;changed++;}
                    else{colorSkipped.push({objectId:'s'+i,reason:'请直接选择文字或路径，再使用原生选色器'});}}
                app.redraw();return resultEdit('已应用 Illustrator 原生颜色',changed?['properties']:[],colorSkipped);
            }
            if(a.type==='properties'){
                var fill=a.fill!==undefined?makeColor(a.fill):null,stroke=a.stroke!==undefined?makeColor(a.stroke):null,font=null;
                if(a.font){try{font=app.textFonts.getByName(a.font);}catch(noFont){var matches=[];for(var fi=0;fi<app.textFonts.length;fi++){if(app.textFonts[fi].family===a.font){matches.push(app.textFonts[fi]);}}if(matches.length===1){font=matches[0];}else{throw Error(matches.length?'这个家族有多种款式，请填写具体字体名称':'找不到该字体，请填写字体 PostScript 名称');}}}
                if(a.fontSize!==undefined){positive(a.fontSize);}if(a.strokeWidth!==undefined&&(!isFinite(a.strokeWidth)||a.strokeWidth<0||a.strokeWidth>1000)){throw Error('描边宽度必须为 0–1000 pt');}
                var skipped=[];geometryUndo=null;
                for(i=0;i<refs.length;i++){var item=refs[i].item;if(item.typename==='TextFrame'){changed++;var propChars=partialRange?partialRange.characters:item.characters;for(j=0;j<propChars.length;j++){var ca=propChars[j].characterAttributes;if(font){ca.textFont=font;}if(a.fontSize!==undefined){ca.size=a.fontSize;}if(fill){ca.fillColor=fill;}if(stroke){ca.strokeColor=stroke;}if(a.strokeWidth!==undefined){ca.strokeWeight=a.strokeWidth;}}}else if(item.typename==='PathItem'&&!item.clipping&&(fill||stroke||a.strokeWidth!==undefined)){changed++;if(fill){item.filled=a.fill!=='none';if(item.filled){item.fillColor=fill;}}if(stroke){item.stroked=a.stroke!=='none';if(item.stroked){item.strokeColor=stroke;}}if(a.strokeWidth!==undefined){item.strokeWidth=a.strokeWidth;}}else{skipped.push({objectId:'s'+i,reason:'此属性条只直接修改文字框和普通路径，不穿透群组'});}}
                app.redraw();return resultEdit('已应用明确填写的属性'+(skipped.length?'，跳过 '+skipped.length+' 个容器':''),changed?['properties']:[],skipped);
            }

            if(a.type==='replace'){
                if(!replacement||replacement.sid!==sid){throw Error('请先记住来源 B');}if(a.sourceFirst)validReplacementSource(replacement.refs);else validRefs(replacement.refs);if(a.sourceFirst?(replacement.role!=='source'||!refs.length):refs.length!==1){throw Error('请按步骤选择来源与目标');}var source=a.sourceFirst?replacement.refs[0].item:refs[0].item,targets=a.sourceFirst?refs:replacement.refs;
                for(i=0;i<targets.length;i++){var targetItem=targets[i].item;if((targetItem.typename==='PathItem'&&targetItem.clipping)||(targetItem.typename==='CompoundPathItem'&&targetItem.pathItems.length&&targetItem.pathItems[0].clipping))throw Error('不能替换剪切路径本身，请选择蒙版内的内容对象');var ancestor=targetItem;while(ancestor&&ancestor.typename!=='Document'){if(ancestor===source){throw Error('来源与目标不能互相包含');}ancestor=ancestor.parent;}ancestor=source;while(ancestor&&ancestor.typename!=='Document'){if(ancestor===targets[i].item){throw Error('来源与目标不能互相包含');}ancestor=ancestor.parent;}}
                var copies=[];try{for(i=0;i<targets.length;i++){var copy=source.duplicate(targets[i].item,ElementPlacement.PLACEBEFORE);copies.push(copy);var b=bounds(targets[i].item.geometricBounds),cb=bounds(copy.geometricBounds),cw=positive(cb[2]-cb[0]),ch=positive(cb[3]-cb[1]),scale=a.fit?Math.min((b[2]-b[0])/cw,(b[3]-b[1])/ch):1;var sx=scale,sy=scale;if(a.scaleMode==='original'){sx=sy=1;}else if(a.scaleMode==='stretch'){sx=(b[2]-b[0])/cw;sy=(b[3]-b[1])/ch;}else if(a.scaleMode==='height'){sx=sy=(b[3]-b[1])/ch;}else if(a.scaleMode==='width'){sx=sy=(b[2]-b[0])/cw;}var cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;setItemBounds(copy,[cx-cw*sx/2,cy-ch*sy/2,cx+cw*sx/2,cy+ch*sy/2]);}}catch(copyError){for(i=copies.length-1;i>=0;i--){try{copies[i].remove();}catch(cleanError){changed++;}}throw copyError;}
                geometryUndo=null;changed=copies.length;if(a.removeTargets){for(i=0;i<targets.length;i++){targets[i].item.remove();}}if(!a.sourceFirst){delete replacementBySession[sid];replacement=null;}app.redraw();return resultEdit('已替换 '+copies.length+' 个位置，来源 B 保留',['replace']);
            }
            throw Error('未知编辑操作');
        }catch(e){return {status:'failed',selectedObjectIds:[],skipped:[],sideEffects:changed?['partial-write']:[],error:{code:'HOST_SCRIPT_ERROR',message:String(e.message||e)+(changed?'；部分对象可能已修改，请检查稿件':'')}};}
    }
    function selectNativeTool(p){
        if(String(app.version)!=='30.0.0'){throw Error('此版本尚未验证原生工具切换');}
        var names={selection:'Adobe Select Tool',text:'Adobe Type Tool',artboard:'Adobe Crop Tool'};
        if(!names.hasOwnProperty(p.tool)){throw Error('未知原生工具');}
        var d=active();
        if(p.docSessionId&&session(d)!==p.docSessionId){throw Error('文档已切换，请重新点击工具');}
        if(app.selectTool(names[p.tool])!==true){throw Error('无法切换原生工具');}
        return {tool:p.tool};
    }
    function handle(encoded){
        var id='';try{
            var payload=parseJSON(decodeURIComponent(encoded));id=String(payload.id||'');var p=payload.params||{},data,command=payload.command;
            // Pure tool navigation must not collect selection/boards, wake-loop or invalidate undo.
            if(command==='SELECT_NATIVE_TOOL'){return stringify({id:id,ok:true,data:selectNativeTool(p)});}
            if(command==='GET_EDITOR_REVISION'){return stringify({id:id,ok:true,data:editorRevision()});}
            var activeDoc=wakeActive();
            if(activeDoc){pruneEditor(session(activeDoc));}else{clearEditorTokens();replacement=null;replacementBySession={};symmetrySession=null;sessions=[];}
            if(command==='PING'){data={appName:app.name,appVersion:app.version,documentCount:app.documents.length};}
            else if(command==='GET_DOCUMENT_CONTEXT'){data=context();}
            else if(command==='GET_EDITOR_STATE'){data=readEditor(p);}
            else if(command==='RELEASE_EDITOR_STATE'){clearEditorTokens();textSearchCache=null;objectSearchCache=null;data=null;}
            else if(command==='EDIT_DOCUMENT'){data=editDocument(p);}
            else if(command==='COLLECT_SNAPSHOT'){data=collect(p);}
            else if(command==='SELECT_OBJECTS'){data=select(p);}
            else if(command==='APPLY_TRANSFORMS'){data=transformPaths(p);}
            else if(command==='UNDO_WRITE'){data=undoGeometry();}
            else{return stringify({id:id,ok:false,error:{code:'CAPABILITY_UNSUPPORTED',message:'该宿主命令尚未通过审查，当前安装版已禁用：'+command}});}
            return stringify({id:id,ok:true,data:data});
        }catch(err){return stringify({id:id,ok:false,error:{code:'HOST_SCRIPT_ERROR',message:String(err.message||err)}});}
    }
    return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};
})();
