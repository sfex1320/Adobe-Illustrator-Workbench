export const NATIVE_SHORTCUTS: Array<{title:string;commands:Array<[string,string]>}> = [
  {title:'群组',commands:[['group','群组'],['ungroup','取消群组'],['smart-group','智能群组'],['ungroup-all','全部取消群组']]},
  {title:'剪贴蒙版',commands:[['mask-create','创建剪贴蒙版'],['mask-release','解散剪贴蒙版']]},
  {title:'路径',commands:[['join','连接端点'],['outline-stroke','轮廓化描边'],['compound','建立复合路径']]},
  {title:'形状',commands:[['shape','转换为形状'],['expand-shape','扩展形状']]},
  {title:'图案',commands:[['pattern-panel','图案选项']]},
  {title:'缠绕',commands:[['intertwine','建立缠绕'],['intertwine-release','释放缠绕']]},
  {title:'重复',commands:[['repeat-radial','径向'],['repeat-grid','网格'],['repeat-mirror','镜像'],['repeat-release','释放'],['repeat-options','选项…']]},
  {title:'路径上的对象',commands:[['on-path-tool','沿路径放置'],['on-path-expand','扩展沿路径对象']]},
  {title:'混合',commands:[['blend','建立混合'],['blend-release','释放混合'],['blend-expand','扩展混合']]},
  {title:'封套扭曲',commands:[['envelope','用顶层对象建立'],['envelope-release','释放封套'],['envelope-expand','扩展封套']]},
  {title:'透视',commands:[['perspective-tool','透视选择工具'],['perspective-grid','透视网格工具']]},
  {title:'实时上色',commands:[['live-paint','建立上色组'],['paint-tool','实时上色工具'],['paint-expand','扩展上色组']]},
  {title:'模型',commands:[['mockup-panel','打开模型面板']]},
  {title:'图像描摹',commands:[['trace-panel','描摹设置'],['trace','建立图像描摹'],['trace-expand','扩展描摹']]},
  {title:'文本绕排',commands:[['wrap','建立绕排'],['unwrap','释放绕排']]},
];
export const SAME_SHORTCUTS:Array<[string,string]>=[['same-fill','填色'],['same-stroke','描边'],['same-weight','线宽'],['same-opacity','透明度'],['same-font','字体家族'],['same-font-style','字体款式'],['same-size','字号']];
