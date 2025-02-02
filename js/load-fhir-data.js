(function(){
  FhirLoader = {};

  FhirLoader.demographics = function(client) {
    
    return client.patient.read().then(function(pt) {
      var name = pt.name[0].given.join(" ") +" "+ pt.name[0].family;
      var birthday = new Date(pt.birthDate).toISOString();
      var gender = pt.gender;

      return {
        name: name,
        gender: gender,
        birthday: birthday
      };
    });
  };

  FhirLoader.vitals = function(client) {
    return Promise.all([
      getObservations(client),
      getEncounters(client)
    ]).then(function(result) {
        return processObservations(result[0], result[1], client);
    });
  }
  

  function cachedLink(items, target) {
    var match = null;
    items.forEach(function(r) {
        var rid = r.resourceType + '/' + r.id;
        if (rid === target.reference) {
            match = r;
        }
    });
    return match;
  }


  function processObservations(observations, encounters, client) {

    var vitals = {heightData: [], bpData: []};

    var vitalsByCode = client.byCode(observations, 'code');

    (vitalsByCode['8302-2']||[]).forEach(function(v){
      vitals.heightData.push({
        vital_date: v.effectiveDateTime,
        height: client.units.cm(v.valueQuantity)
      }); 
    });

    (vitalsByCode['55284-4']||[]).forEach(function(v){

      var components = v.component;

      var diastolicObs = components.find(function(component){
      	return component.code.coding.find(function(coding) {
      		return coding.code === "8462-4";
      	});
      });
      var systolicObs = components.find(function(component){
      	return component.code.coding.find(function(coding) {
      		return coding.code === "8480-6";
      	});
      });
      var systolic = systolicObs.valueQuantity.value;
      var diastolic = diastolicObs.valueQuantity.value;
      var extensions = v.extension;
      var obj = {
        vital_date: v.effectiveDateTime,
        systolic: systolic,
        diastolic: diastolic
      };
      
      if (extensions) {
         var position = extensions.find(function(extension) {
            return extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/vital-signs#position";
         });
         if (position) {
      	     var coding = position.valueCodeableConcept.coding[0];
             obj["bodyPositionCode"] = coding.system + coding.code;
         }
      }
      
      if (v.encounter){
           var encounter = cachedLink(encounters, v.encounter);
           var encounter_type = encounter.class;
           if (encounter_type === "outpatient") {
               encounter_type = "ambulatory";
           }
           obj["encounterTypeCode"] = "http://smarthealthit.org/terms/codes/EncounterType#" + encounter_type;
      }
              
      if (v.bodySite) {
        obj["bodySiteCode"] = v.bodySite.coding[0].system + v.bodySite.coding[0].code;
      }

      if (v.method) {
        obj["methodCode"] = v.method.coding[0].system + v.method.coding[0].code;
      }
      
      //obj["encounterTypeCode"] = "http://smarthealthit.org/terms/codes/EncounterType#ambulatory";
      
      vitals.bpData.push(obj);
    });

    return vitals;
  }

  function getObservations(client) {
    var query = new URLSearchParams();
    query.set("code", ["http://loinc.org|8302-2","http://loinc.org|55284-4"].join(","));
    return client.patient.request("Observation?" + query, { flat: true });
  }

  function getEncounters(client) {
    return client.patient.request("Encounter", { flat: true });
  }

})();
