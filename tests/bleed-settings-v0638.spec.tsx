// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import type {Workspace} from '@aiq/core';
import type {EditorState} from '@aiq/contracts';
import {BleedSettings} from '../packages/modules/artboards/src/BleedSettings';
afterEach(cleanup);
function setup(){
 const state={docSessionId:'one',rulerUnit:'pt',bleedOffsets:[1,2,3,4]} as EditorState;
 const editDocument=vi.fn(async(_s,a)=>({status:'completed',sideEffects:[],skipped:[],selectedObjectIds:[],bleedOffsets:a.offsets}));
 const port={getEditorState:()=>state,readEditorState:vi.fn(async()=>state),getSettings:()=>({}),updateSettings:vi.fn(),editDocument} as unknown as Workspace;
 render(<BleedSettings workspace={port}/>);return {state,editDocument,port};
}
it('displays asymmetric sides without changing them on focus or locking; links only editing',()=>{
 const {editDocument,port}=setup();expect(screen.getByLabelText('上出血')).toHaveValue('2');
 fireEvent.focus(screen.getByLabelText('上出血'));fireEvent.blur(screen.getByLabelText('上出血'));
 expect(screen.getByLabelText('左出血')).toHaveValue('1');
 fireEvent.change(screen.getByLabelText('上出血'),{target:{value:'3.'}});
 for(const side of ['上','下','左','右'])expect(screen.getByLabelText(side+'出血')).toHaveValue('3.');
 expect(editDocument).not.toHaveBeenCalled();expect(port.readEditorState).not.toHaveBeenCalled();
});
it('sends independent L/T/R/B values through one explicit command and rejects negatives',async()=>{
 const {editDocument}=setup();fireEvent.click(screen.getByLabelText('锁定四边（输入时同步）'));
 fireEvent.change(screen.getByLabelText('上出血'),{target:{value:'6'}});
 fireEvent.click(screen.getByText('应用出血'));await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(1));
 expect(editDocument.mock.calls[0]![1]).toEqual({type:'set-bleed',offsets:[1,6,3,4]});
 await waitFor(()=>expect(screen.getByText('应用出血')).not.toBeDisabled());
 fireEvent.change(screen.getByLabelText('上出血'),{target:{value:'-1'}});fireEvent.click(screen.getByText('应用出血'));
 await screen.findByRole('alert');expect(editDocument).toHaveBeenCalledTimes(1);
});
