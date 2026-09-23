import {describe,it,expect} from 'vitest';
import {unitFactor,displayLength,parseArtboardRange,artboardNames} from '@aiq/core';
describe('delivery units and explicit pages',()=>{
 it('converts physical lengths without guessing unknown units',()=>{expect(displayLength(72,'mm')).toBe('25.4');expect(displayLength(72,'in')).toBe('1');expect(unitFactor('pc')).toBe(12);expect(()=>unitFactor(undefined)).toThrow();});
 it('keeps requested PDF order and deduplicates pages',()=>{expect(parseArtboardRange('3,1,5-4,3',5)).toEqual([2,0,4,3]);});
 it('rejects invalid or empty ranges without expanding scope',()=>{expect(parseArtboardRange('',5)).toEqual([]);for(const value of ['0','1,9','1-a'])expect(()=>parseArtboardRange(value,5)).toThrow();});
 it('names selected boards in chosen order with physical sizes',()=>{const boards=[{index:0,name:'A front',bounds:[0,0,72,144] as [number,number,number,number]},{index:1,name:'B back',bounds:[0,0,144,72] as [number,number,number,number]}];expect(artboardNames(boards,[1,0],'{nn}-{name}-{w}x{h}{u}',7,'in','back','rear')).toEqual([{index:1,name:'07-B rear-2x1in'},{index:0,name:'08-A front-1x2in'}]);});
});
