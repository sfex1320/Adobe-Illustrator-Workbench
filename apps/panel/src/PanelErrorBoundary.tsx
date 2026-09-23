import {Component} from 'react';
import type {ReactNode} from 'react';

/** Render errors are asynchronous to bootstrap and must not erase the whole panel. */
export class PanelErrorBoundary extends Component<{children:ReactNode;onRecover?:()=>void},{failed:boolean}> {
 override state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 override render(){
  if(this.state.failed)return <section role="alert" style={{padding:20,color:'#eee',background:'#252628',font:'14px sans-serif'}}>
   <h2>{this.props.onRecover?'当前工具加载失败':'工作台界面加载失败'}</h2>
   <p>可重试加载；若恢复旧页面时反复失败，请返回常用工具。</p>
   <button type="button" onClick={()=>this.setState({failed:false})}>重试加载</button>
   {this.props.onRecover&&<button type="button" onClick={this.props.onRecover}>返回常用工具</button>}
   <p>此提示不会保存、关闭或修改 Illustrator 稿件。</p>
  </section>;
  return this.props.children;
 }
}
