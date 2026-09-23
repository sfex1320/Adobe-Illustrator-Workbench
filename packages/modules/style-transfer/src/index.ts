import type {ModuleBundle} from '@aiq/contracts';
import {MODULE_CONTRACT_VERSION} from '@aiq/contracts';
import {StyleTransferPanel} from './StyleTransferPanel.js';
export const moduleBundle:ModuleBundle={manifest:{id:'style-transfer',title:'样式吸取',description:'逐项吸取图形、文字、群组与剪贴蒙版属性，选择属性赋予目标',version:'0.1.0',contractVersion:MODULE_CONTRACT_VERSION,icon:'select',requiredCapabilities:['editorTools'],optionalCapabilities:[],commands:[],panelContributions:[{id:'main',navTitle:'样式吸取',icon:'select',viewKind:'module-view'}],settingsVersion:1,tools:[{id:'style-transfer',title:'样式吸取',description:'吸取、定位来源及按属性赋予',icon:'select',viewId:'main'}],moduleDependencies:[],defaultEnabled:true},implementation:{async onActivate(){},async onDeactivate(){},async runCommand(){}}};
export const moduleViews={main:StyleTransferPanel};
