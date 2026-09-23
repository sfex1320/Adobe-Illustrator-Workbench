/** CEP filesystem access for small user settings and export status, never artwork. */
interface FileResult { err: number; data?: string }
interface CepFiles {
  stat(path: string): FileResult;
  readFile(path: string, encoding?:string): FileResult;
  writeFile(path: string, data: string, encoding?:string): FileResult;
  makedir(path: string): FileResult;
  rename(from: string, to: string): FileResult;
  deleteFile(path: string): FileResult;
}
export function cepUserFiles(customRoot?:string) {
  const env = globalThis as { cep?: { fs?: CepFiles }; __adobe_cep__?: { getSystemPath?(type: string): string } };
  const fs = env.cep?.fs, getPath = env.__adobe_cep__?.getSystemPath;
  if (!fs || !getPath) return null;
  let root = decodeURI(getPath.call(env.__adobe_cep__, 'userData')).replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1').replace(/[\\/]$/, '');
  if (!root) return null;
  if(customRoot!==undefined){if(!/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(customRoot)||Array.from(customRoot).some(c=>c.charCodeAt(0)<32)||customRoot.split(/[\\/]/).includes('..'))throw Error('请选择有效的绝对目录');root=customRoot.replace(/[\\/]$/,'');}
  root += '/AIQ-Workbench';
  const path = (name: string) => { if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(name) || name.startsWith('.')) throw Error('无效的工作台数据名称'); return root + '/' + name; };
  return {
    root,
    remove(name:string):void {if(fs.stat(path(name)).err===0&&fs.deleteFile(path(name)).err)throw Error('无法清理工作台回包');},
    read(name: string,encoding?:string): string | null { const r = fs.readFile(path(name),encoding); return r.err === 0 && typeof r.data === 'string' && r.data.length <= 1500000 ? r.data : null; },
    write(name: string, data: string,encoding?:string): void {
      if (data.length > 1500000) throw Error('工作台记录过大');
      fs.makedir(root);
      if (fs.writeFile(path(name), data,encoding).err) throw Error('无法保存工作台记录');
    },
    replace(name: string, data: string,encoding?:string): void {
      // Keep the last complete file until the new contents have been fully written.
      const temp = name + '.tmp'; this.write(temp, data,encoding);
      const previous = this.read(name,encoding);
      let complete=previous!==null;
      if(complete&&name.endsWith('.json')){try{JSON.parse(previous!);}catch{complete=false;}}
      if (complete) this.write(name + '.bak', previous!,encoding);
      if (fs.stat(path(name)).err===0 && fs.deleteFile(path(name)).err) throw Error('无法更新工作台设置');
      if (fs.rename(path(temp), path(name)).err) throw Error('工作台设置替换失败，已保留备份');
    },
  };
}
