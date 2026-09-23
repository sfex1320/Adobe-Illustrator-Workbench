// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import type {Workspace} from '@aiq/core';
import {ExportJobStatus} from '../packages/modules/export/src/ExportJobStatus.js';
afterEach(cleanup);
it('shows preparation separately from delivered files and does not call the host',async()=>{
  const workspace={supportsExportProgress:()=>true,readExportProgress:async()=>({jobId:'job-fixture-01',total:70,current:2,completed:0,failed:0,completedIndexes:[],status:'running',phase:'pdf',prepared:2}),isExportRunning:()=>true,cancelExport:vi.fn()} as unknown as Workspace;
  render(<ExportJobStatus workspace={workspace} jobId="job-fixture-01" running result={null}/>);
  await waitFor(()=>expect(screen.getByText(/中间页.*2\/70/)).toBeVisible());
  expect(screen.getByText(/已交付.*0\/70/)).toBeVisible();
  expect(screen.getByRole('progressbar',{name:'文件交付进度'})).toHaveAttribute('value','0');
  expect(screen.getByRole('progressbar',{name:'文件交付进度'})).toHaveAttribute('max','70');
});
it('keeps a remounted job visible without offering to replay an unknown host call',async()=>{
  const workspace={supportsExportProgress:()=>true,readExportProgress:async()=>({jobId:'job-fixture-01',total:70,current:2,completed:0,failed:0,completedIndexes:[],status:'running',phase:'host-uncertain',prepared:2}),isExportRunning:()=>false} as unknown as Workspace;
  render(<ExportJobStatus workspace={workspace} jobId="job-fixture-01" running={false} result={null}/>);
  await waitFor(()=>expect(screen.getByText(/宿主尚未确认结束/)).toBeVisible());
  expect(screen.queryByRole('button',{name:/重试|重新/})).not.toBeInTheDocument();
});
