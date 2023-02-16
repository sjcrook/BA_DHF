const flowApi = require('/data-hub/public/flow/flow-api.sjs');

function getExtension(mimeType) {
    return xdmp.xqueryEval(
        `xquery version "1.0-ml";

        import module namespace admin = "http://marklogic.com/xdmp/admin"
            at "/MarkLogic/admin.xqy";

        declare namespace mt = "http://marklogic.com/xdmp/mimetypes";
        declare variable $mimeType as xs:string external;

        for $mime-type in admin:mimetypes-get(admin:get-configuration())
            where $mime-type/*:name eq $mimeType
            return
                $mime-type/mt:extensions/text()`,
        { mimeType: mimeType }
    );
}

function transform(docURI, docValue) {
    let attachmentCounter = 1;
    const binaryDocumentArr = [];
  
    function updateURIVersion(docURI) {
        const index = docURI.indexOf('.json');
        return docURI.substring(0, index) + '_v2.json';
    }

    function walkTree(entity, levelsDown = 10) {
        if (levelsDown < 0) {
            return '-- pruned --';
        }
        if (entity === null) {
            return null;
        }
        if (typeof entity === 'object') {
            if (Array.isArray(entity)) {
                const a = [];
                for (let i = 0; i < entity.length; i++) {
                    a[i] = walkTree(entity[i], levelsDown - 1);
                }
                return a;
            } else {
                const o = {};
                for (const p in entity) {
                    o[p] = walkTree(entity[p], levelsDown - 1);
                }
                return o;
            }
        } else {
            let m;
            if (typeof entity === 'string' && (m = entity.substring(0, 50).match(/^data:(.{5,30});base64,/))) {
                const extension = getExtension(m[1]);
                const attachmentURI = '/attachments' + docURI.substring(0, docURI.indexOf('.json')) + '_v2/' + (attachmentCounter++) + '.' + extension;
                let binaryNode = new NodeBuilder();
                binaryNode.addBinary(xs.hexBinary(xs.base64Binary(entity.substring(m[0].length))));              
                binaryDocumentArr.push({ uri: attachmentURI, value: binaryNode.toNode() });
                return attachmentURI;
            } else {
                return entity;
            }
        }
    }
  
    const docValueUpdated = walkTree(docValue);
    return {
        docUpdated: {
            uri: updateURIVersion(docURI),
            value: docValueUpdated
        },
        binaryDocumentArr: binaryDocumentArr
    }
}

function main(content, options) {
    const transformObj = transform(content.uri, content.value.toObject());

    const result = [];

    result.push({ ...transformObj.docUpdated, context: content.context });
    transformObj.binaryDocumentArr.forEach(item => result.push({ ...item, context: content.context }));

    return result;
}

module.exports = {
    main
};