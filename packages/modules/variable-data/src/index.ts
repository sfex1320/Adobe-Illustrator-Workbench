import type {ModuleBundle} from '@aiq/contracts';
import {MODULE_CONTRACT_VERSION} from '@aiq/contracts';
import {VariableDataPanel} from './VariableDataPanel.js';
export const moduleBundle:ModuleBundle={manifest:{id:'variable-data',title:'可变数据',description:'表格列绑定模板对象，生成文字、图片和二维码变化稿',version:'0.1.0',contractVersion:MODULE_CONTRACT_VERSION,icon:'modules',requiredCapabilities:['editorTools'],optionalCapabilities:[],commands:[],panelContributions:[{id:'main',navTitle:'可变数据',icon:'modules',viewKind:'module-view'}],settingsVersion:1,moduleDependencies:[],defaultEnabled:true},implementation:{async onActivate(){},async onDeactivate(){},async runCommand(){}}};
export const moduleViews={main:VariableDataPanel};
