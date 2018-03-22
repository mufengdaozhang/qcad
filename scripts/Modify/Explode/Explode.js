/**
 * Copyright (c) 2011-2018 by Andrew Mustun. All rights reserved.
 * 
 * This file is part of the QCAD project.
 *
 * QCAD is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * QCAD is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with QCAD.
 */

include("../Modify.js");
include("scripts/ShapeAlgorithms.js");

function Explode(guiAction) {
    Modify.call(this, guiAction);
}

Explode.prototype = new Modify();

Explode.getPreferencesCategory = function() {
    return [qsTr("Modify"), qsTr("Explode")];
};

Explode.initPreferences = function(pageWidget, calledByPrefDialog, document) {
    var widgets = getWidgets(pageWidget);
    if (!RTextBasedData.hasProxy()) {
        // remove MultilineTextToSimpleText option:
        widgets["MultilineTextToSimpleText"].visible = false;
    }

    if (!RSpline.hasProxy()) {
        widgets["SplineTolerance"].visible = false;
        widgets["SplineTolerance_Label"].visible = false;
        widgets["SplinesToLineSegments"].visible = false;
        widgets["Indent"].destroy();
        pageWidget.findChild("GridLayout").addWidget(widgets["SplineSegments_Label"], 2, 0, 1, 2);
    }
    else {
        widgets["SplinesToLineSegments"].toggled.connect(function(state) {
            widgets["SplineSegments"].enabled = state;
            widgets["SplineSegments_Label"].enabled = state;
        });

        widgets["SplineSegments"].enabled = widgets["SplinesToLineSegments"].checked;
        widgets["SplineSegments_Label"].enabled = widgets["SplinesToLineSegments"].checked;
    }
};

Explode.prototype.beginEvent = function() {
    Modify.prototype.beginEvent.call(this);
    var di = this.getDocumentInterface();
    Explode.explodeSelection(di, this.getToolTitle());
    this.terminate();
};

/**
 * Explodes all selected entities.
 * \param di Document interface
 * \param toolTitle Tool title used for undo/redo information.
 */
Explode.explodeSelection = function(di, toolTitle) {
    var document = di.getDocument();
    var storage = document.getStorage();
    var ids = document.querySelectedEntities();
    var i, k, e, n;
    var polyline, shapes, shape;

    var options = {};
    options["splineTolerance"] = RSettings.getDoubleValue("Explode/SplineTolerance", 0.01);
    options["splineSegments"] = RSettings.getIntValue("Explode/SplineSegments", 64);
    options["ellipseSegments"] = RSettings.getIntValue("Explode/EllipseSegments", 32);
    options["splinesToLineSegments"] = RSettings.getBoolValue("Explode/SplinesToLineSegments", false);
    options["textToPolylines"] = RSettings.getBoolValue("Explode/TextToPolylines", true);
    options["multilineTextToSimpleText"] = RSettings.getBoolValue("Explode/MultilineTextToSimpleText", true);

    var op = new RAddObjectsOperation();

    if (!isNull(toolTitle)) {
        op.setText(toolTitle);
    }

    for (i=0; i<ids.length; i++) {
        var id = ids[i];
        var entity = document.queryEntity(id);
        if (isNull(entity)) {
            debugger;
        }

        // these entity types are not explodable:
        if (isPointEntity(entity) ||
            isLineEntity(entity) ||
            isArcEntity(entity) ||
            isCircleEntity(entity) ||
            isViewportEntity(entity)) {
            continue;
        }

        //var newShapes = [];
        //var newEntities = [];

        var news = Explode.explodeEntity(entity, options);

        // add explosion result and delete original:
        if (news.length!==0) {
            // add entities based on shapes that resulted from the explosion:
            for (k=0; k<news.length; k++) {
                if (isEntity(news[k])) {
                    // add entities based on entities that resulted from the explosion:
                    op.addObject(news[k], false);
                }
                else {
                    shape = news[k];
                    e = shapeToEntity(entity.getDocument(), shape);
                    if (!isNull(e)) {
                        e.setSelected(true);
                        e.copyAttributesFrom(entity.data());
                        if (!isNull(shape.color)) {
                            e.setColor(new RColor(shape.color));
                        }
                        op.addObject(e, false);
                    }
                }
            }

            // delete original entity:
            op.deleteObject(entity);
        }
        else {
            // delete original entity:
            op.deleteObject(entity);
        }
    }

    di.applyOperation(op);
};

/**
 * \return Array of new shapes and entities.
 */
Explode.explodeEntity = function(entity, options) {
    var ret = [];

    if (isNull(options)) {
        options = {};
    }

    var k, e, n, d;
    var col, row;
    var painterPaths;

    var document = entity.getDocument();
    var storage = document.getStorage();

    var splineTolerance = options["splineTolerance"];
    var splineSegments = options["splineSegments"];
    var ellipseSegments = options["ellipseSegments"];
    var splinesToLineSegments = options["splinesToLineSegments"]
    var textToPolylines = options["textToPolylines"]
    var multilineTextToSimpleText = options["multilineTextToSimpleText"];

    if (isNull(splineTolerance)) {
        splineTolerance = RSettings.getDoubleValue("Explode/SplineTolerance", 0.01);
    }
    if (isNull(splineSegments)) {
        splineSegments = RSettings.getIntValue("Explode/SplineSegments", 64);
    }
    if (isNull(ellipseSegments)) {
        ellipseSegments = RSettings.getIntValue("Explode/EllipseSegments", 32);
    }
    if (isNull(splinesToLineSegments)) {
        splinesToLineSegments = RSettings.getBoolValue("Explode/SplinesToLineSegments", false);
    }
    if (isNull(textToPolylines)) {
        textToPolylines = RSettings.getBoolValue("Explode/TextToPolylines", true);
    }
    if (isNull(multilineTextToSimpleText)) {
        multilineTextToSimpleText = RSettings.getBoolValue("Explode/MultilineTextToSimpleText", true);
    }

    // explode ellipse into polyline with arc segments:
    if (isEllipseEntity(entity)) {
        if (REllipse.hasProxy()) {
            var ellipse = entity.getData().castToShape();
            var polyline = ellipse.approximateWithArcs(ellipseSegments);
            if (!polyline.isEmpty()) {
                ret.push(polyline);
            }
        }
        else {
            continue;
        }
    }

    // explode polyline into line and arc segments:
    else if (isPolylineEntity(entity)) {
        polyline = entity.getData().castToShape();
        if (RPolyline.hasProxy() && polyline.hasWidths()) {
            var pls = polyline.getOutline();
            for (k=0; k<pls.length; k++) {
                ret.push(pls[k]);
            }
        }
        else {
            var polySegments = polyline.getExploded();
            if (polySegments.length>0) {
                for (k=0; k<polySegments.length; k++) {
                    var shape = polySegments[k].data();

                    // last shape might have zero length if polyline is closed geometrically and logically:
                    if (k===polySegments.length-1) {
                        if (shape.getLength()<1.0e-5) {
                            break;
                        }
                    }

                    ret.push(shape.clone());
                }
            }
        }
    }

    // explode spline into polyline with arc or line segments:
    else if (isSplineEntity(entity)) {
        var spline = entity.getData().castToShape();
        var pl;
        if (RSpline.hasProxy() && !splinesToLineSegments) {
            pl = spline.approximateWithArcs(splineTolerance);
        }
        else {
            pl = spline.toPolyline(splineSegments);
        }

        pl.simplify();
        ret.push(pl);
    }

    // explode hatch into lines / solid fill into boundary:
    else if (isHatchEntity(entity)) {
        if (entity.isSolid()) {
            for (k=0; k<entity.getLoopCount(); k++) {
                var shapes = entity.getLoopBoundary(k);
                for (n=0; n<shapes.length; n++) {
                    shape = shapes[n];
                    ret.push(shape.clone());
                }
            }
        }
        else {
            painterPaths = entity.getPainterPaths(false);
            for (k=0; k<painterPaths.length; k++) {
                shapes = painterPaths[k].getShapes();
                for (n=0; n<shapes.length; n++) {
                    shape = shapes[n].data();
                    if (isSplineShape(shape)) {
                        shape = ShapeAlgorithms.splineToLineOrArc(shape, 0.01);
                    }
                    ret.push(shape.clone());
                }
            }
        }
    }

    // explode dimension into lines, solids (triangles) and a text entity:
    else if (isDimensionEntity(entity)) {
        shapes = entity.getShapes();
        for (k=0; k<shapes.length; k++) {
            ret.push(shapes[k].data());
        }
        var textData = entity.getData().getTextData();
        e = new RTextEntity(entity.getDocument(), textData);
        e.setSelected(true);
        e.copyAttributesFrom(entity.data());
        ret.push(e);
    }

    // explode leaders into lines and solids (triangles):
    else if (isLeaderEntity(entity)) {
        shapes = entity.getShapes();
        for (k=0; k<shapes.length; k++) {
            shape = shapes[k].data();
            ret.push(shape.clone());
        }
    }

    // explode solids into polylines:
    else if (isSolidEntity(entity)) {
        shapes = entity.getShapes();
        for (k=0; k<shapes.length; k++) {
            shape = shapes[k].data();
            if (shape.countVertices()===4) {
                var v3 = shape.getVertexAt(3);
                shape.setVertexAt(3, shape.getVertexAt(2));
                shape.setVertexAt(2, v3);
            }
            ret.push(shape.clone());
        }
    }

    // explode faces into polylines:
    else if (isFaceEntity(entity)) {
        shapes = entity.getShapes();
        for (k=0; k<shapes.length; k++) {
            shape = shapes[k].data();
            ret.push(shape.clone());
        }
    }

    // explode text entities into lines, arcs and splines:
    else if (isTextEntity(entity)) {
        // explode multi-block text into simple text entities:
        // each text block with the same format is converted into one individual simple text entity:
        if (!entity.isSimple() && multilineTextToSimpleText && RTextBasedData.hasProxy()) {
            var textDatas = entity.getSimpleTextBlocks();

            for (k=0; k<textDatas.length; k++) {
                var d = textDatas[k];
                e = new RTextEntity(document, new RTextData(d))
                e.setSelected(true);
                e.copyAttributesFrom(entity.data());
                if (e.getColor()!==d.getColor()) {
                    e.setColor(d.getColor());
                }
                ret.push(e);
            }
        }
        else {
            painterPaths = entity.getPainterPaths();
            for (k=0; k<painterPaths.length; k++) {
                var p = painterPaths[k].getPen();
                var b = painterPaths[k].getBrush();
                var col = undefined;

                if (p.style()!==Qt.NoPen) {
                    if (p.color().isValid()) {
                        col = p.color().name();
                    }
                }
                else if (b.style()!==Qt.NoBrush) {
                    if (b.color().isValid()) {
                        col = b.color().name();
                    }
                }

                // ignore text bounding box, used only to display instead of
                // text at small zoom factors:
                if (painterPaths[k].getFeatureSize()<0) {
                    continue;
                }

                var plText = undefined;

                shapes = painterPaths[k].getShapes();
                for (n=0; n<shapes.length; n++) {
                    shape = shapes[n];
                    if (isSplineShape(shape)) {
                        // spline to arc or line or spline:
                        shape = ShapeAlgorithms.splineToLineOrArc(shape, splineTolerance);

                        if (textToPolylines) {
                            // spline to polyline with arcs:
                            if (isSplineShape(shape)) {
                                if (RSpline.hasProxy() && !splinesToLineSegments) {
                                    shape = shape.approximateWithArcs(splineTolerance);
                                }
                                else {
                                    shape = shape.toPolyline(splineSegments);
                                }
                            }
                        }
                    }

                    if (!isNull(shape)) {
                        var sc = shape.clone();
                        sc.color = col;

                        if (textToPolylines) {
                            // explode to polylines:
                            if (!isNull(plText) && plText.getEndPoint().equalsFuzzy(shape.getStartPoint())) {
                                plText.appendShape(sc);
                            }
                            else {
                                if (!isNull(plText)) {
                                    plText.toLogicallyClosed();
                                }

                                plText = new RPolyline();
                                ret.push(plText);
                                plText.appendShape(sc);
                            }
                        }
                        else {
                            // explode to lines, arcs, polylines:
                            ret.push(sc);
                        }
                    }
                }

                if (textToPolylines) {
                    if (!isNull(plText)) {
                        plText.toLogicallyClosed();
                    }
                }
            }
        }
    }

    // explode attribute entities into texts:
    else if (isAttributeEntity(entity)) {
        // create text data from attribute data:
        d = new RTextData(entity.getData());
        // unlink from parent (block ref):
        d.setParentId(RObject.INVALID_ID);
        e = new RTextEntity(document, d);
        e.setSelected(true);
        e.copyAttributesFrom(entity.data());
        ret.push(e);
    }

    // explode block reference or block reference array:
    else if (isBlockReferenceEntity(entity)) {
        var data = entity.getData();
        var pos = entity.getPosition();

        // explode array into multiple block references:
        if (data.getColumnCount()>1 || data.getRowCount()>1) {
            for (col=0; col<data.getColumnCount(); col++) {
                for (row=0; row<data.getRowCount(); row++) {
                    var offset = data.getColumnRowOffset(col, row);

                    e = entity.clone();
                    e.setRowCount(1);
                    e.setColumnCount(1);
                    e.setPosition(pos.operator_add(offset));
                    storage.setObjectId(e, RObject.INVALID_ID);
                    e.setSelected(true);
                    ret.push(e);
                }
            }
        }

        // explode block reference into contained entities:
        else {
            var subIds = document.queryBlockEntities(data.getReferencedBlockId());
            for (k=0; k<subIds.length; k++) {
                var subEntity = data.queryEntity(subIds[k]);
                if (isNull(subEntity)) {
                    continue;
                }

                // ignore attribute definitions:
                if (isAttributeDefinitionEntity(subEntity)) {
                    continue;
                }

                e = subEntity.clone();
                //data.applyColumnRowOffsetTo(e, col, row);
                storage.setObjectId(e, RObject.INVALID_ID);
                e.setBlockId(document.getCurrentBlockId());
                e.setSelected(true);
                ret.push(e);
            }
        }
    }

    return ret;
};
