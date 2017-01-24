"use strict";

const
    EventEmitter = require("events"),
	
	cloneDeep = require('clone-deep');

function GraphConfig(graphConfig) {
    var
        graphs = graphConfig ? graphConfig : [];
    
    this.getGraphs = function() {
        return graphs;
    };
    
    /**
     * newGraphs is an array of objects like {label: "graph label", height:, fields:[{name: curve:{offset:, power:, inputRange:, outputRange:, steps:}, color:, }, ...]}
     */
    this.setGraphs = function(newGraphs) {
        graphs = newGraphs;
        
        this.emit("change");
    };
    
    /**
     * Convert the given graph configs to make them appropriate for the given flight log.
     */
    this.adaptGraphs = function(flightLog, graphs) {
        var 
            logFieldNames = flightLog.getMainFieldNames(),
            
            // Make copies of graphs into here so we can modify them without wrecking caller's copy
            newGraphs = [];
        
        for (var i = 0; i < graphs.length; i++) {
            var 
                graph = graphs[i],
                newGraph = $.extend(
                    // Default values for missing properties:
                    {
                        height: 1
                    }, 
                    // The old graph
                    graph, 
                    // New fields to replace the old ones:
                    {
                        fields:[]
                    }
                ),
                colorIndex = 0;
            
            for (var j = 0; j < graph.fields.length; j++) {
                var
                    field = graph.fields[j],
                    matches,
                    defaultCurve;
                
                var adaptField = function(field) {
                    defaultCurve = GraphConfig.getDefaultCurveForField(flightLog, field.name);
                    
                    if (field.curve === undefined) {
                        field.curve = defaultCurve;
                    } else {
                        /* The curve may have been originally created for a craft with different endpoints, so use the 
                         * recommended offset and input range instead of the provided one.
                         */
                        field.curve.offset = defaultCurve.offset;
                        field.curve.inputRange = defaultCurve.inputRange;
                    }
                    
                    if (field.color === undefined) {
                        field.color = GraphConfig.PALETTE[colorIndex % GraphConfig.PALETTE.length];
                        colorIndex++;
                    }
                    
                    if (field.smoothing === undefined || field.smoothing == "default") {
                        field.smoothing = GraphConfig.getDefaultSmoothingForField(flightLog, field.name);
                    } else {
	                    let
		                    smoothing = parseInt(field.smoothing, 10);
	
	                    if (!isNaN(smoothing)) {
		                    field.smoothing = smoothing;
	                    }
                    }
                    
                    return field;
                };
                
                if ((matches = field.name.match(/^(.+)\[all\]$/))) {
                    var 
                        nameRoot = matches[1],
                        nameRegex = new RegExp("^" + nameRoot + "\[[0-9]+\]$");
                    
                    for (var k = 0; k < logFieldNames.length; k++) {
                        if (logFieldNames[k].match(nameRegex)) {
                            newGraph.fields.push(adaptField(Object.assign(cloneDeep(field), {name: logFieldNames[k]})));
                        }
                    }
                } else {
                    // Don't add fields if they don't exist in this log
                    if (flightLog.getMainFieldIndexByName(field.name) !== undefined) {
                        newGraph.fields.push(adaptField(cloneDeep(field)));
                    }
                }
            }
            
            newGraphs.push(newGraph);
        }
        
        this.setGraphs(newGraphs);
    };
}

GraphConfig.PALETTE = [
    "#fb8072", // Red
    "#8dd3c7", // Cyan
    "#ffffb3", // Yellow
    "#bebada", // Purple
    "#80b1d3",
    "#fdb462",
    "#b3de69",
    "#fccde5",
    "#d9d9d9",
    "#bc80bd",
    "#ccebc5",
    "#ffed6f"
];

GraphConfig.load = function(config) {
    // Upgrade legacy configs to suit the newer standard by translating field names
    if (config) {
        for (var i = 0; i < config.length; i++) {
            var graph = config[i];
            
            for (var j = 0; j < graph.fields.length; j++) {
                var 
                    field = graph.fields[j],
                    matches;
                
                if ((matches = field.name.match(/^gyroData(.+)$/))) {
                    field.name = "gyroADC" + matches[1];
                }
            }
        }
    } else {
        config = false;
    }
    
    return config;
};

const
    EXAMPLE_GRAPHS = [
        {
            label: "Motors",
            fields: ["motor[all]", "servo[5]"]
        },
        {
            label: "Gyros",
            fields: ["gyroADC[all]"]
        },
        {
            label: "PIDs",
            fields: ["axisSum[all]"]
        },
        {
            label: "Gyro + PID roll",
            fields: ["axisP[0]", "axisI[0]", "axisD[0]", "gyroADC[0]"]
        },
        {
            label: "Gyro + PID pitch",
            fields: ["axisP[1]", "axisI[1]", "axisD[1]", "gyroADC[1]"]
        },
        {
            label: "Gyro + PID yaw",
            fields: ["axisP[2]", "axisI[2]", "axisD[2]", "gyroADC[2]"]
        },
        {
            label: "Accelerometers",
            fields: ["accSmooth[all]"]
        },
    ];

GraphConfig.getDefaultSmoothingForField = function(flightLog, fieldName) {
    if (fieldName.match(/^motor\[/)) {
        return 5000;
    } else if (fieldName.match(/^servo\[/)) {
        return 5000;
    } else if (fieldName.match(/^gyroADC\[/)) {
        return 3000;
    } else if (fieldName.match(/^accSmooth\[/)) {
        return 3000;
    } else if (fieldName.match(/^axis.+\[/)) {
        return 3000;
    } else {
        return 0;
    }
};

GraphConfig.getDefaultCurveForField = function(flightLog, fieldName) {
    var
        sysConfig = flightLog.getSysConfig();
    
    if (fieldName.match(/^motor\[/)) {
        return {
            offset: -(sysConfig.motorOutputHigh + sysConfig.motorOutputLow) / 2,
            power: 1.0,
            inputRange: (sysConfig.motorOutputHigh - sysConfig.motorOutputLow) / 2,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^servo\[/)) {
        return {
            offset: -1500,
            power: 1.0,
            inputRange: 500,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^gyroADC\[/)) {
        return {
            offset: 0,
            power: 0.25,
            inputRange: 2.0e-5 / sysConfig.gyroScale,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^accSmooth\[/)) {
        return {
            offset: 0,
            power: 0.5,
            inputRange: sysConfig.acc_1G * 3.0, /* Reasonable typical maximum for acc */
            outputRange: 1.0
        };
    } else if (fieldName.match(/^axis.+\[/)) {
        return {
            offset: 0,
            power: 0.3,
            inputRange: 400,
            outputRange: 1.0
        };
    } else if (fieldName == "rcCommand[3]") { // Throttle
        return {
            offset: -1500,
            power: 1.0,
            inputRange: 500,
            outputRange: 1.0
        };
    } else if (fieldName == "rcCommand[2]") { // Yaw
        return {
            offset: 0,
            power: 0.8,
            inputRange: 500,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^rcCommand\[/)) {
        return {
            offset: 0,
            power: 0.8,
            inputRange: 500 * (sysConfig.rcRate ? sysConfig.rcRate : 100) / 100,
            outputRange: 1.0
        };
    } else if (fieldName == "heading[2]") {
        return {
            offset: -Math.PI,
            power: 1.0,
            inputRange: Math.PI,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^heading\[/)) {
        return {
            offset: 0,
            power: 1.0,
            inputRange: Math.PI,
            outputRange: 1.0
        };
    } else if (fieldName.match(/^sonar.*/)) {
        return {
            offset: -200,
            power: 1.0,
            inputRange: 200,
            outputRange: 1.0
        };
    } else {
        // Scale and center the field based on the whole-log observed ranges for that field
        var
            stats = flightLog.getStats(),
            fieldIndex = flightLog.getMainFieldIndexByName(fieldName),
            fieldStat = fieldIndex !== undefined ? stats.field[fieldIndex] : false;
        
        if (fieldStat) {
            return {
                offset: -(fieldStat.max + fieldStat.min) / 2,
                power: 1.0,
                inputRange: Math.max((fieldStat.max - fieldStat.min) / 2, 1.0),
                outputRange: 1.0
            };
        } else {
            return {
                offset: 0,
                power: 1.0,
                inputRange: 500,
                outputRange: 1.0
            };
        }
    }
};

/**
 * Get an array of suggested graph configurations will be usable for the fields available in the given flightlog.
 *
 * @param {FlightLog} flightLog
 * @param {String[]?} graphNames - Supply to only fetch the graph with the given labels.
 *
 * @returns {Object[]}
 */
GraphConfig.getExampleGraphConfigs = function(flightLog, graphNames) {
    let
        result = [];
    
    for (let srcGraph of EXAMPLE_GRAPHS) {
        let
            destGraph = {
                label: srcGraph.label,
                fields: [],
                height: srcGraph.height || 1
            };
        
        if (graphNames && graphNames.indexOf(srcGraph.label) == -1) {
            continue;
        }
        
        for (let srcFieldName of srcGraph.fields) {
            let
                destField = {
                    name: srcFieldName,
                };
            
            destGraph.fields.push(destField);
        }
        
        result.push(destGraph);
    }
    
    return result;
};

Object.setPrototypeOf(GraphConfig.prototype, EventEmitter.prototype);

module.exports = GraphConfig;
