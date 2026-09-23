import type {ModuleBundle} from '@aiq/contracts';
import {MODULE_CONTRACT_VERSION} from '@aiq/contracts';
import {ProductivityPanel} from './ProductivityPanel.js';
export const moduleBundle:ModuleBundle={manifest:{id:'productivity',title:'生产辅助',description:'蒙版图片、跨画板复制、文字适配合并、基线、编号条码及 Photoshop 往返',version:'0.1.0',contractVersion:MODULE_CONTRACT_VERSION,icon:'modules',requiredCapabilities:['editorTools'],optionalCapabilities:[],commands:[],panelContributions:[{id:'main',navTitle:'生产辅助',icon:'modules',viewKind:'module-view'}],tools:[
 {id:'mask-fit',title:'蒙版内图片调整',description:'填满、适合、按宽／高等比、自由填充与定位',icon:'modules',viewId:'main'},
 {id:'duplicate-boards',title:'多画板同位置复制',description:'复制 logo、页脚和说明',icon:'modules',viewId:'main'},
 {id:'text-fit',title:'文字溢出与适配',description:'只读检查溢出；适配等待原生内存预检',icon:'text',viewId:'main'},
 {id:'text-merge',title:'碎文字合并',description:'合并 PDF 来稿中的可编辑文字',icon:'text',viewId:'main'},
 {id:'baseline',title:'文字基线对齐',description:'单行点文字按基线对齐',icon:'text',viewId:'main'},
 {id:'sequence',title:'流水号与页码',description:'文字占位符、页码与画板名称',icon:'text',viewId:'main'},
 {id:'barcode',title:'条码联动流水号',description:'Code 128、EAN-13 批量条码',icon:'modules',viewId:'main'},
 {id:'photoshop',title:'一键 Photoshop',description:'打开链接图片，保存后原位更新',icon:'modules',viewId:'main'}
 ],settingsVersion:1,moduleDependencies:[],defaultEnabled:true},implementation:{async onActivate(){},async onDeactivate(){},async runCommand(){}}};
export const moduleViews={main:ProductivityPanel};
