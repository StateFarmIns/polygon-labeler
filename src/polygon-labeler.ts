import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import polylabel from 'polylabel';
import area from '@turf/area';
import combine from '@turf/combine';
import booleanWithin from "@turf/boolean-within";
import pointOnFeature from '@turf/point-on-feature';
import intersect from '@turf/intersect';

/**
 * Method used to group features into unique collections based off of a property
 * @name groupFeatureCollectionByIdentifier 
 * @param {GeoJSON} featureCollection input polygon(s) as {@link FeatureCollection}
 * @param {string} property the property to group by
 * @returns {Object} collections of features grouped by property
 */
function groupFeatureCollectionByIdentifier (featureCollection: FeatureCollection<Polygon | MultiPolygon>, property: string) {
    const featureCollections: { [key: string]: FeatureCollection } = {};

    if (!featureCollection.features || featureCollection.features.length === 0) {
        throw new Error("Feature collection is empty or invalid");
    }

    // Loop through each feature in the collection and push it to the appropriate collection based off of the property
    for (const feature of featureCollection.features) {
        if (!feature.properties || !(property in feature.properties)) {
            throw new Error("Feature properties is empty or invalid");
        }
        const prop = feature.properties[property];
        if (featureCollections[prop] != undefined) {
            featureCollections[prop].features.push(feature);
        } else {
            featureCollections[prop] = {
                type: "FeatureCollection",
                features: [feature],
            };
        }
    }

    return featureCollections;
}

/**
 * Calculate the visual center for each feature in a collection
 * 
 * @name getVisualCenters
 * @param {GeoJSON} featureCollection input polygon(s) as {@link FeatureCollection}
 * @param {string} propertyName the property name to be added to the visual center feature
 * @param {string} propertyValue the property value to be added to the visual center feature
 * @returns {GeoJSON} visual center of the input polygon(s) as a {@link Point} feature, or undefined if calculation fails
 */

function getVisualCenters(featureCollection: FeatureCollection<Polygon | MultiPolygon>, propertyName: string, propertyValue: string): Feature | undefined {
    let largestArea = 0;
    let largestPolygon: number[][][] = [];

    // Loop through each feature in the collection and calculate the largest polygon by area
    for (const feature of featureCollection.features) {
        if (feature["geometry"]["type"] == "Polygon") {
            const polygonArea = area(feature["geometry"]);
            if (polygonArea > largestArea) {
                largestArea = polygonArea;
                largestPolygon = feature.geometry.coordinates;
            }
        } else {
            for(const polygons of feature["geometry"]["coordinates"]) {
                const singlePolygon: Feature = {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: polygons,
                    },
                    properties: {}
                };
                const polygonArea = area(singlePolygon);
                if (polygonArea > largestArea) {
                    largestArea = polygonArea;
                    largestPolygon = polygons;
                }
            }
        }
    }

    // Create a point feature for the visual center
    const visualCenter: Feature<Point> = {
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: []
        },
        properties: {
            [propertyName]: propertyValue
        }
    };

    // Create a feature for the largest polygon
    const largePolygon: Feature = {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: largestPolygon
        },
        properties: {}
    };

    let centerMass: number[] | undefined = undefined;
    // Attempt to calculate the center mass of the largest polygon
    centerMass = polylabel((largePolygon.geometry as Polygon).coordinates);

    // Create a point feature for the center mass
    const centerPoint: Feature = {
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: centerMass,
        },
        properties: {}
    };

    // Determine if the center mass is within the largest polygon. If the center mass is within the polygon, set the visual center to the center mass. Otherwise, set the visual center to a point on the polygon.
    if (booleanWithin(centerPoint, largePolygon)) {
        visualCenter.geometry.coordinates = centerMass;
    } else {
        visualCenter.geometry.coordinates = pointOnFeature(largePolygon as Feature).geometry.coordinates;
    }

    return visualCenter;
}

/**
 * Calculate the centroid of each polygon based off of the label field
 * 
 * @name getLabelPoints
 * @param {GeoJSON} featureCollection input polygon(s) as {@link FeatureCollection}
 * @param {string} labelField the field to be used as the label for the visual center feature
 * @param {string} uniqueIdentifierField the field to be used as the unique identifier for the visual center feature
 * @param {Object} southWestCorner the south west corner of the map view
 * @param {Object} northEastCorner the north east corner of the map view
 * @returns {GeoJSON} visual center of the input polygon(s) as a {@link Point} feature
 */
function getLabelPoints(featureCollection: FeatureCollection<Polygon | MultiPolygon>, labelField: string, uniqueIdentifierField: string, southWestCorner: { "lat": number, "lng": number }, northEastCorner: { "lat": number, "lng": number }): FeatureCollection {
    
    
    // Initialize an empty FeatureCollection to store the polygon centroids
    const polygonCentroidGeoJson: FeatureCollection = {
        type: "FeatureCollection",
        features: [],
    };

    // Create a polygon representing the map view bounds
    const mapViewBound: Feature = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [southWestCorner.lng, southWestCorner.lat],
                    [southWestCorner.lng, northEastCorner.lat],
                    [northEastCorner.lng, northEastCorner.lat],
                    [northEastCorner.lng, southWestCorner.lat],
                    [southWestCorner.lng, southWestCorner.lat],
                ]
            ]
        },
        "properties": {}
    };

    // Group the feature collection by the label field to process each group separately
    const allPolygons = groupFeatureCollectionByIdentifier (featureCollection, labelField);

    // Loop through each group of polygons and calculate the visual center for each group of polygons
    for (const groupPolygons in allPolygons) {
        const polygons = allPolygons[groupPolygons];
        if (!polygons) continue;
        const gidFeatures: { [key: string]: FeatureCollection } = {};
        // Combine all the unique feature collections into one feature collection based off of the unique identifier field
        for (const polygon of polygons.features) {
            
            const gid = polygon.properties![uniqueIdentifierField]
            
            if (polygon.geometry.type === "Polygon") {
                if (!gidFeatures[gid]) {
                    gidFeatures[gid] = {
                        type: "FeatureCollection",
                        features: [],
                    };
                }
                gidFeatures[gid].features.push(polygon);
            } else {
                if (!gidFeatures[gid]) {
                    gidFeatures[gid] = {
                        type: "FeatureCollection",
                        features: [],
                    };
                }
                // Process MultiPolygon coordinates
                for(const coords of (polygon.geometry as MultiPolygon).coordinates) {
                    const singlePolygon: Feature = {
                        type: "Feature",
                        geometry: {
                            type: "Polygon",
                            coordinates: coords,
                        },
                        properties: {
                            popup: gid,
                        },
                    };
                    gidFeatures[gid].features.push(singlePolygon);
                }
            }
        }
        for (const gid in gidFeatures) {
            // Combine all the features into one feature collection
            const combinedFeatures = combine(gidFeatures[gid] as FeatureCollection<Polygon | MultiPolygon>);

            const clippedFeatureCollection: FeatureCollection<Polygon | MultiPolygon> = {
                type: "FeatureCollection",
                features: [],
            };

            // Clip the combined feature collection to the map
            for(const feature of combinedFeatures.features) {
                const featuresToIntersect: FeatureCollection<Polygon | MultiPolygon> = {
                    type: "FeatureCollection",
                    features: [feature as Feature<Polygon | MultiPolygon>, mapViewBound as Feature<Polygon | MultiPolygon>]
                };
                const clippedFeature = intersect(featuresToIntersect as FeatureCollection<Polygon | MultiPolygon>);
                if (clippedFeature != null) {
                    clippedFeatureCollection.features.push(clippedFeature);
                }
            }
            // Calculate the visual center for the clipped feature collection
            if (clippedFeatureCollection.features.length != 0) {
                const labelPoint = getVisualCenters(
                    clippedFeatureCollection,
                    labelField,
                    groupPolygons
                );

                // If the visual center is defined, add it to the polygon centroid feature collection
                if (labelPoint != undefined) {
                    polygonCentroidGeoJson.features.push(labelPoint);
                }
            }
        }
    }
    return polygonCentroidGeoJson;
}

export { getLabelPoints, getVisualCenters, groupFeatureCollectionByIdentifier }
