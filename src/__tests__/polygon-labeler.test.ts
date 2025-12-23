import { expect } from "chai";
import { groupFeatureCollectionByIdentifier , getVisualCenters, getLabelPoints } from "../polygon-labeler.js";
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Point } from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import fs from "fs";
import path from "path";

describe("groupFeatureCollectionByIdentifier ", () => {
  it("should group features by a single property", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          },
          properties: { name: "Area A", id: 1 },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[2, 2], [2, 3], [3, 3], [3, 2], [2, 2]]],
          },
          properties: { name: "Area A", id: 2 },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[4, 4], [4, 5], [5, 5], [5, 4], [4, 4]]],
          },
          properties: { name: "Area B", id: 3 },
        },
      ],
    };

    const grouped = groupFeatureCollectionByIdentifier (featureCollection, "name");

    expect(Object.keys(grouped)).to.have.lengthOf(2);
    expect(grouped["Area A"]?.features).to.have.lengthOf(2);
    expect(grouped["Area B"]?.features).to.have.lengthOf(1);
  });

  it("should handle MultiPolygon features", () => {
    const featureCollection: FeatureCollection<Polygon | MultiPolygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [[[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]],
          },
          properties: { region: "North" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[2, 2], [2, 3], [3, 3], [3, 2], [2, 2]]],
          },
          properties: { region: "North" },
        },
      ],
    };

    const grouped = groupFeatureCollectionByIdentifier (featureCollection, "region");

    expect(Object.keys(grouped)).to.have.lengthOf(1);
    expect(grouped["North"]?.features).to.have.lengthOf(2);
  });

  it("should throw an error for empty feature collection", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [],
    };

    expect(() => groupFeatureCollectionByIdentifier (featureCollection, "name")).to.throw();
  });

  it("should throw an error for features without properties", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          },
          properties: {},
        },
      ],
    };

    expect(() => groupFeatureCollectionByIdentifier (featureCollection, "name")).to.throw();
  });
});

describe("getVisualCenters", () => {
  it("should calculate visual center for a simple Polygon", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]],
          },
          properties: { name: "Square" },
        },
      ],
    };

    const center = getVisualCenters(featureCollection, "label", "TestLabel");

    expect(center).to.not.equal(undefined);
    expect(center?.geometry.type).to.equal("Point");
    expect(center?.properties?.label).to.equal("TestLabel");

    const isInside = booleanPointInPolygon(center! as Feature<Point>, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should calculate visual center for MultiPolygon and use largest polygon", () => {
    const featureCollection: FeatureCollection<MultiPolygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
              [[[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]]],
            ],
          },
          properties: { name: "Multi" },
        },
      ],
    };

    const center = getVisualCenters(featureCollection, "label", "MultiLabel");

    expect(center).to.not.equal(undefined);
    expect(center?.geometry.type).to.equal("Point");
    expect(center?.properties?.label).to.equal("MultiLabel");

    const largerPolygon = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]]],
      },
      properties: {},
    };
    const isInLargerPolygon = booleanPointInPolygon(center! as Feature<Point>, largerPolygon as Feature<Polygon>);
    expect(isInLargerPolygon).to.equal(true);
  });

  it("should handle multiple Polygon features and use largest", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          },
          properties: { name: "Small" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
          },
          properties: { name: "Large" },
        },
      ],
    };

    const center = getVisualCenters(featureCollection, "label", "TestLabel");

    expect(center).to.not.equal(undefined);

    const largerPolygon = featureCollection.features[1];
    const isInside = booleanPointInPolygon(center! as Feature<Point>, largerPolygon as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should add custom property name and value to result", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          },
          properties: { name: "Test" },
        },
      ],
    };

    const center = getVisualCenters(featureCollection, "customProp", "customValue");

    expect(center).to.not.equal(undefined);
    expect(center?.properties?.customProp).to.equal("customValue");

    const isInside = booleanPointInPolygon(center! as Feature<Point>, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should handle complex polygon shapes", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 5], [2, 5], [2, 2], [5, 2], [5, 0], [0, 0]]],
          },
          properties: { name: "L-Shape" },
        },
      ],
    };

    const center = getVisualCenters(featureCollection, "label", "ComplexShape");

    expect(center).to.not.equal(undefined);
    expect(center?.geometry.type).to.equal("Point");
    expect((center?.geometry as Point)?.coordinates.length).to.equal(2);

    const isInside = booleanPointInPolygon(center! as Feature<Point>, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });
});

describe("getLabelPoints", () => {
  it("should calculate centroids for simple polygons", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]],
          },
          properties: { name: "Area1", id: "1" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);
    expect(result.features[0]?.geometry.type).to.equal("Point");
    expect(result.features[0]?.properties?.name).to.equal("Area1");

    const isInside = booleanPointInPolygon(result.features[0] as Feature<Point>, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should handle multiple polygons with same label", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
          },
          properties: { name: "SameArea", id: "1" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[3, 3], [3, 5], [5, 5], [5, 3], [3, 3]]],
          },
          properties: { name: "SameArea", id: "2" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(2);

    result.features.forEach((labelPoint, idx) => {
      const polygon = featureCollection.features[idx];
      const isInside = booleanPointInPolygon(labelPoint as Feature<Point>, polygon as Feature<Polygon>);
      expect(isInside).to.equal(true);
    });
  });

  it("should handle MultiPolygon features", () => {
    const featureCollection: FeatureCollection<MultiPolygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
              [[[3, 3], [3, 5], [5, 5], [5, 3], [3, 3]]],
            ],
          },
          properties: { name: "MultiArea", id: "1" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);

    const isInside = booleanPointInPolygon(result.features[0] as Feature<Point>, featureCollection.features[0] as Feature<MultiPolygon>);
    expect(isInside).to.equal(true);
  });

  it("should clip polygons to map bounds", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[-100, -100], [-100, 100], [100, 100], [100, -100], [-100, -100]]],
          },
          properties: { name: "LargeArea", id: "1" },
        },
      ],
    };

    const southWest = { lat: -5, lng: -5 };
    const northEast = { lat: 5, lng: 5 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);

    const isInside = booleanPointInPolygon(result.features[0] as Feature<Point>, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should handle polygons outside map bounds", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[100, 100], [100, 110], [110, 110], [110, 100], [100, 100]]],
          },
          properties: { name: "OutsideArea", id: "1" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(0);
  });

  it("should throw error when feature has no properties during label point calculation", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]],
          },
          properties: { name: "Area1" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[5, 5], [5, 8], [8, 8], [8, 5], [5, 5]]],
          },
          properties: null as any,
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    expect(() => getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    )).to.throw("Feature properties is empty or invalid");
  });

  it("should handle invalid polygon that causes polylabel to fail", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]],
          },
          properties: { name: "InvalidPolygon", id: "1" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(0);
  });

  it("should handle degenerate polygon with zero area", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 0.0001], [0.0001, 0], [0, 0]]],
          },
          properties: { name: "TinyPolygon", id: "1" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
  });

  it("should handle different unique identifiers", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]],
          },
          properties: { name: "Area1", customId: "custom-1" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[5, 5], [5, 8], [8, 8], [8, 5], [5, 5]]],
          },
          properties: { name: "Area1", customId: "custom-2" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "customId",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(2);

    result.features.forEach((labelPoint, idx) => {
      const polygon = featureCollection.features[idx];
      const isInside = booleanPointInPolygon(labelPoint as Feature<Point>, polygon as Feature<Polygon>);
      expect(isInside).to.equal(true);
    });
  });

  it("should combine polygons with same unique identifier", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
          },
          properties: { name: "Area1", id: "same-id" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[3, 3], [3, 5], [5, 5], [5, 3], [3, 3]]],
          },
          properties: { name: "Area1", id: "same-id" },
        },
      ],
    };

    const southWest = { lat: -10, lng: -10 };
    const northEast = { lat: 10, lng: 10 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "id",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);

    const labelPoint = result.features[0] as Feature<Point>;
    const isInPolygon1 = booleanPointInPolygon(labelPoint, featureCollection.features[0] as Feature<Polygon>);
    const isInPolygon2 = booleanPointInPolygon(labelPoint, featureCollection.features[1] as Feature<Polygon>);
    expect(isInPolygon1 || isInPolygon2).to.equal(true);
  });

  it("should have label inside of L shaped polygon at full extent", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 5], [2, 5], [2, 2], [5, 2], [5, 0], [0, 0]]],
          },
          properties: { gid: 1, name: "L-Shape" },
        },
      ],
    };

    const southWest = { lat: -2.849, lng: -2.906 };
    const northEast = { lat: 6.751, lng: 7.001 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "gid",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);

    const labelPoint = result.features[0] as Feature<Point>;
    const isInside = booleanPointInPolygon(labelPoint, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should have label inside of L shaped polygon at partial extent", () => {
    const featureCollection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0, 5], [2, 5], [2, 2], [5, 2], [5, 0], [0, 0]]],
          },
          properties: { gid: 1, name: "L-Shape" },
        },
      ],
    };

    const southWest = { lat: 1.527, lng: 1.811 };
    const northEast = { lat: 3.053, lng: 3.384 };

    const result = getLabelPoints(
      featureCollection,
      "name",
      "gid",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(1);

    const labelPoint = result.features[0] as Feature<Point>;
    const isInside = booleanPointInPolygon(labelPoint, featureCollection.features[0] as Feature<Polygon>);
    expect(isInside).to.equal(true);
  });

  it("should calculate centroids for all US states at max zoom out", () => {
    const statesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures", "states.geojson"), "utf8")
    );

    const southWest = { lat: -1, lng: -161 };
    const northEast = { lat: 67, lng: -65 };

    const result = getLabelPoints(
      statesData,
      "NAME",
      "GEOID",
      southWest,
      northEast
    );

    expect(result.type).to.equal("FeatureCollection");
    expect(result.features).to.have.lengthOf(52);

    result.features.forEach((feature) => {
      expect(feature.type).to.equal("Feature");
      expect(feature.geometry.type).to.equal("Point");
      expect(Array.isArray((feature.geometry as Point).coordinates)).to.equal(true);
      expect((feature.geometry as Point).coordinates.length).to.equal(2);
      expect(typeof feature.properties?.NAME).to.equal("string");
      expect(feature.properties?.NAME.length).to.be.greaterThan(0);

      const statePolygon = statesData.features.find((f: Feature<Polygon | MultiPolygon>) => (f as Feature<Polygon>).properties?.NAME === feature.properties?.NAME) as Feature<Polygon>;
      expect(statePolygon).to.not.equal(undefined)

      const isInside = booleanPointInPolygon(feature as Feature<Point>, statePolygon as Feature<Polygon>);
      expect(isInside).to.equal(true);
    });
  });
});
