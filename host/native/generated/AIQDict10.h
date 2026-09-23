#pragma once
// Generated SDK projection, source SHA256 cec94a5939c31fa0a5247a6c7d3cf0dc207bfff43380105db5ab811de2830753
#include <cstddef>
struct AIQDict10 {
AIAPI AIErr (*CreateDictionary) ( AIDictionaryRef* dictionary );
void (*unused1)();
void (*unused2)();
AIAPI ai::int32 (*Release) ( AIDictionaryRef dictionary );
void (*unused4)();
void (*unused5)();
void (*unused6)();
void (*unused7)();
AIAPI AIDictKey (*Key) ( const char* keyString );
void (*unused9)();
void (*unused10)();
void (*unused11)();
void (*unused12)();
void (*unused13)();
void (*unused14)();
void (*unused15)();
AIAPI AIErr (*GetArtEntry) ( ConstAIDictionaryRef dictionary, AIDictKey key, AIArtHandle* art );
AIAPI AIErr (*NewArtEntry) ( AIDictionaryRef dictionary, AIDictKey key, ai::int16 type );
void (*unused18)();
AIAPI AIErr (*MoveEntryToArt) ( AIDictionaryRef dictionary, AIDictKey key, ai::int16 paintOrder,

			AIArtHandle prep, AIArtHandle* art );
AIAPI AIErr (*CopyArtToEntry) ( AIDictionaryRef dictionary, AIDictKey key, AIArtHandle art );
void (*unused21)();
void (*unused22)();
void (*unused23)();
void (*unused24)();
void (*unused25)();
void (*unused26)();
void (*unused27)();
void (*unused28)();
void (*unused29)();
void (*unused30)();
void (*unused31)();
void (*unused32)();
void (*unused33)();
void (*unused34)();
void (*unused35)();
void (*unused36)();
void (*unused37)();
void (*unused38)();
void (*unused39)();
void (*unused40)();
void (*unused41)();
void (*unused42)();
void (*unused43)();
void (*unused44)();
void (*unused45)();
};
static_assert(sizeof(AIQDict10)==46*sizeof(void(*)()),"suite size");
static_assert(offsetof(AIQDict10,CopyArtToEntry)==20*sizeof(void(*)()),"CopyArtToEntry slot");
static_assert(offsetof(AIQDict10,CreateDictionary)==0*sizeof(void(*)()),"CreateDictionary slot");
static_assert(offsetof(AIQDict10,GetArtEntry)==16*sizeof(void(*)()),"GetArtEntry slot");
static_assert(offsetof(AIQDict10,Key)==8*sizeof(void(*)()),"Key slot");
static_assert(offsetof(AIQDict10,MoveEntryToArt)==19*sizeof(void(*)()),"MoveEntryToArt slot");
static_assert(offsetof(AIQDict10,NewArtEntry)==17*sizeof(void(*)()),"NewArtEntry slot");
static_assert(offsetof(AIQDict10,Release)==3*sizeof(void(*)()),"Release slot");
