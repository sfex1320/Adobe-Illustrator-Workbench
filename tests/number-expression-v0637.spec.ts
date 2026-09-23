import {expect,it} from 'vitest';
import {parseNumberExpression} from '../packages/core/src/number-expression';
it.each([['(210 + 6)/2',108],['３３４．９＋０．０７',334.97],['2×3−4÷2',4],['-.5 * -2',1],['1e2 + 2.5',102.5]])('calculates %s with precedence and full-width input',(text,value)=>{
 expect(parseNumberExpression(text)).toBeCloseTo(value);
});
it.each(['','1/0','1+','2**3','2 3','Math.random()','1,2','1e999','('.repeat(200)+'1'+')'.repeat(200)])('rejects invalid or nonfinite expression %s',text=>expect(()=>parseNumberExpression(text)).toThrow());
