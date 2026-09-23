// Isolated native logic test, not Illustrator ABI acceptance.
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <stdexcept>
#include <iostream>
#include "../.research/bleed-write-v0638/host/native/generated/AIQDocumentContract.h"
using AIErr=int;constexpr int kNoErr=0,kCantHappenErr=1;
using HANDLE=int;using DWORD=unsigned long;
constexpr int INVALID_HANDLE_VALUE=-1,MAX_PATH=260,GENERIC_WRITE=1,CREATE_NEW=1,FILE_ATTRIBUTE_TEMPORARY=1;
std::string response;bool collision=false,ioFailure=false,noDocument=false,readFailure=false,writeFailure=false,mismatch=false;int writes=0;
DWORD GetTempPathW(int,wchar_t*){return 4;}
HANDLE CreateFileW(wchar_t*,int,int,void*,int,int,void*){return collision?-1:1;}
bool WriteFile(HANDLE,const char* text,DWORD size,DWORD* written,void*){*written=ioFailure?0:size;response=std::string(text,size);return !ioFailure;}
void CloseHandle(HANDLE){}void DeleteFileW(wchar_t*){}
struct SPBasicSuite{};
AIQDocumentSuite21 documentSuite={};AIQRealRect current={};
template<class T>struct Suite{const T* value;Suite(SPBasicSuite*,const char*,int):value(&documentSuite){}};
AIErr fileResponse(const char*,const char* json){response=json;return kNoErr;}
#include "../.research/bleed-write-v0638/host/native/document-bleed-write.h"
void reset(){response.clear();collision=ioFailure=noDocument=readFailure=writeFailure=mismatch=false;writes=0;current={0,0,0,0};}
void require(bool passed,const char* name){if(!passed)throw std::runtime_error(name);std::cout<<"PASS "<<name<<'\n';}
void run(const char* values){std::string request="abcdef0123456789abcdef0123456789:";request+=values;writeDocumentBleed(nullptr,request.c_str());}
int main(){try{
 documentSuite.GetDocument=[](void** doc)->int{*doc=noDocument?nullptr:&current;return 0;};
 documentSuite.GetDocumentBleeds=[](AIQRealRect* out)->int{*out=current;if(mismatch&&writes)out->top+=1;return readFailure?1:0;};
 documentSuite.SetDocumentBleeds=[](const AIQRealRect& value)->int{++writes;if(writeFailure)return 1;current=value;return 0;};
 reset();run("1,2,3,4");require(writes==1&&current.left==1&&current.top==2&&current.right==3&&current.bottom==4&&response.find("\"ok\":true")!=std::string::npos,"independent L/T/R/B and verified response");
 reset();run("0,0,0,0");require(writes==0&&response.find("\"changed\":false")!=std::string::npos,"identical values do not write");
 for(const char* values:{"-1,2,3,4","73,2,3,4","1.2.3,2,3,4","nan,2,3,4","1,2,3,4,5","1,2,3","1e3,2,3,4"}){reset();run(values);require(writes==0,"malformed or out-of-range request rejected");}
 reset();collision=true;run("1,2,3,4");require(writes==0,"reply collision rejects before mutation");
 reset();noDocument=true;run("1,2,3,4");require(writes==0&&response.find("NO_DOCUMENT")!=std::string::npos,"no document rejected");
 reset();readFailure=true;run("1,2,3,4");require(writes==0,"failed initial read rejects before mutation");
 reset();writeFailure=true;run("1,2,3,4");require(response.find("BLEED_WRITE_FAILED")!=std::string::npos,"failed writer not reported successful");
 reset();mismatch=true;run("1,2,3,4");require(response.find("BLEED_VERIFY_FAILED")!=std::string::npos,"mismatched reread not reported successful");
 return 0;
}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
