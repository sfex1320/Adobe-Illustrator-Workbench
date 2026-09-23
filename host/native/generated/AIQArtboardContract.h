// Generated from pinned Artboard Suite 4 declarations.
#pragma once
#include <cstddef>
#include "IAIArtboards.hpp"
static_assert(sizeof(ai::ArtboardList)==sizeof(void*),"SDK list layout");
static_assert(sizeof(ai::ArtboardProperties)==sizeof(void*),"SDK properties layout");
struct AIQArtboardSuite4 {
    AIAPI AIErr (*Init)(ai::ArtboardProperties& artboard);
    void (*reserved1)(); // CloneArtboard: never called
    AIAPI AIErr (*Dispose)(ai::ArtboardProperties& properties);
    void (*reserved3)(); // GetPosition: never called
    void (*reserved4)(); // SetPosition: never called
    void (*reserved5)(); // GetPAR: never called
    void (*reserved6)(); // SetPAR: never called
    void (*reserved7)(); // GetName: never called
    void (*reserved8)(); // SetName: never called
    void (*reserved9)(); // GetShowDisplayMark: never called
    void (*reserved10)(); // SetShowDisplayMark: never called
    AIAPI AIErr (*GetArtboardList)(ai::ArtboardList& artboardList);
    AIAPI AIErr (*ReleaseArtboardList)(ai::ArtboardList& artboardList);
    void (*reserved13)(); // AddNew: never called
    void (*reserved14)(); // Delete: never called
    AIAPI AIErr (*GetCount)(const ai::ArtboardList& artboardList,ai::ArtboardID& count);
    AIAPI AIErr (*GetActive)(const ai::ArtboardList& artboardList,ai::ArtboardID& index);
    void (*reserved17)(); // SetActive: never called
    void (*reserved18)(); // Update: never called
    AIAPI AIErr (*GetArtboardProperties)(ai::ArtboardList& artboardList, ai::ArtboardID index, ai::ArtboardProperties& properties);
    void (*reserved20)(); // GetRulerOrigin: never called
    void (*reserved21)(); // SetRulerOrigin: never called
    void (*reserved22)(); // Insert: never called
    void (*reserved23)(); // IsDefaultName: never called
    void (*reserved24)(); // SetIsDefaultName: never called
    AIAPI AIErr (*IsSelected)(const ai::ArtboardProperties& properties, AIBoolean &isSelected);
    void (*reserved26)(); // SelectArtboard: never called
    void (*reserved27)(); // SelectArtboards: never called
    void (*reserved28)(); // SelectAllArtboards: never called
    void (*reserved29)(); // DeleteArtboards: never called
    void (*reserved30)(); // DeselectArtboard: never called
    void (*reserved31)(); // DeselectAllArtboards: never called
    void (*reserved32)(); // AreAnyArtboardsOverlapping: never called
};
static_assert(offsetof(AIQArtboardSuite4,Init)==0*sizeof(void*),"SDK slot Init");
static_assert(offsetof(AIQArtboardSuite4,Dispose)==2*sizeof(void*),"SDK slot Dispose");
static_assert(offsetof(AIQArtboardSuite4,GetArtboardList)==11*sizeof(void*),"SDK slot GetArtboardList");
static_assert(offsetof(AIQArtboardSuite4,ReleaseArtboardList)==12*sizeof(void*),"SDK slot ReleaseArtboardList");
static_assert(offsetof(AIQArtboardSuite4,GetCount)==15*sizeof(void*),"SDK slot GetCount");
static_assert(offsetof(AIQArtboardSuite4,GetActive)==16*sizeof(void*),"SDK slot GetActive");
static_assert(offsetof(AIQArtboardSuite4,GetArtboardProperties)==19*sizeof(void*),"SDK slot GetArtboardProperties");
static_assert(offsetof(AIQArtboardSuite4,IsSelected)==25*sizeof(void*),"SDK slot IsSelected");