/**
 * Parse CSharp-Assembly C# .NET BinaryFormatter.Serialize() file
 * without requiring any of the referenced classes to be present.
 * a.k.a. [MS-NRBF]: .NET Remoting: Binary Format Data Structure
 * Also prints offset address and length for convenient hex editing.
 * 
 * Example:
 *   node csharp-assembly-dump.js input/batim.game > output/out.log
 */

// dependency libraries
const fs = require('fs');
const assert = require('chai').assert;

// args
const INPUT_FILE = process.argv[2] || 'F:/Desktop/tmp/bindiff/batim.game';

// utils
const INDENT = '  ';
let level = 0;
const indent = () => repeat(level, INDENT).join('');
const log = s => console.log(s);
const logIndent = (o, suffix='') => {
	log(indent() + `${o._type}:${suffix}`);
	level++;
	if (o.RecordTypeEnum)	logKeyValue(o, 'RecordTypeEnum');
};
const _logValue = v => {
	if (null == v || 'object' !== typeof v) return ''+v;
	if ('LengthPrefixedString' === v._type) v = v.String;
	return (v.string ? v.string : JSON.stringify(v.value)) +
		('string' === typeof v.value ? '' :
			` (0x${v.buffer.toString('hex').replace(/^(.{1,}?)0+$/, '$1')})`) +
		` [0x${v.offset.toString(16)}` +
		`,0x${v.length.toString(16)}]`;
};
const logValue = v => {
	log(indent() + _logValue(v));
	return v;
};
const logKey = (o,k,cb) => {
	log(indent() +`${k}:`);
	level++;
	o[k] = cb();
	level--;
};
const logKeyValue = (o,k,v) => {
	if (undefined === v) {
		v = o[k];
	}
	else {
		o[k] = v;
	}
	let s = `${k}: `;	
	if (Array.isArray(v)) {
		s += '[\n';
		for (const _v of v) {
			s += indent() + INDENT + _logValue(_v) +'\n';
		}
		s += indent() + ']';
	}
	else s += _logValue(v);
	log(indent() + s);
	return v.value;
};
const logListOf = (len, o, k, structureCb) => {
	logIndent({ _type: k }, ' [');
  o[k] = ListOf(structureCb, len);
	logOutdent();
	log(indent() + ']');
};
const logOutdent = () => {
	level--;
};
const repeat = (n, v) => new Array(n).fill(0).map(()=>v);
process.on('uncaughtException', e => {
	// NOTICE: must carefully serialize Error types, or empty object will be output
	if (e instanceof Error) e = { message: e.message, stack: e.stack };
	if (null != e.stack) e.stack = e.stack.split(/(?:\r?\n)+/g);
	log(JSON.stringify({ msg: 'Uncaught Exception', ...e }, null, 2));
	process.exit(1);
})

// implementation

// --- BUFFER TRAVERSAL ---

const m = (method, byteLen) => {
	const _offset = offset;
	const length = byteLen;
	const buffer = b.slice(offset, offset+byteLen);
	const value = null == method ? null : b[method](offset);
	offset += byteLen;
	return { offset: _offset, length, buffer, value };
}

// --- BINARY TYPES ---

const single = () => m('readFloatLE',  4);
const double = () => m('readDoubleLE', 4);
const int8   = () => m('readInt8',     1);
const int16  = () => m('readInt16LE',  2);
const int32  = () => m('readInt32LE',  4);
const int64  = () => m('readInt64LE',  8);
const uint16 = () => m('readUInt16LE', 2);
const uint32 = () => m('readUInt32LE', 4);
const uint64 = () => m('readUInt64LE', 8);
const utf8   = len => {
	const r = m(null, len);
	r.value = r.buffer.toString('utf8');
	return r;
};

/**
 * A UTF-8 string prefixed by its Uint8 length.
 */
const LengthPrefixedString = () => {
	const r = {};
	r._type = 'LengthPrefixedString'
	r.Length = int8();
	r.String = utf8(r.Length.value);
	return r;
};

/**
 * A fixed-length array of any structure.
 * @param {} structureCb - Function to parse one structure.
 * @param {*} length - How many times to repeat.
 * @return {array} - Resulting list of structure values.
 */
const ListOf = (structureCb, length) => {
	const a = [];
	while (a.length < length) {
		a.push(structureCb(a.length));
	}
	return a;
};


// --- STRUCTURES ---

/**
 * Global index of all declared objects by id.
 * For use as objects reference each other.
 */
const ObjectIndex = {};

/**
 * Read an object id, and register the parent object under it.
 */
const ObjectId = parent => {
	const id = int32();
	ObjectIndex[id.value] = parent;
	return id;
};

const FutureObjectIndex = [];
const FutureObject = (r, id) => {
	// to be resolved at the end;
	// because it may have been defined out-of-order,
	// or perhaps in circular reference
	FutureObjectIndex.push(() => {
		r.data = ObjectIndex[id];
	});
};

const MemberReference = () => {
	const r = {};
	r._type = 'MemberReference';
	logIndent(r);
	logKeyValue(r, 'IdRef', int32());
	FutureObject(r.ResolvedObject = {}, r.IdRef.value);
	logOutdent();
	return r;
};

/**
 * The root-most object at the top of the object tree.
 * There is always only one per-file.
 */
let ROOT_ID;

/**
 * First record type occuring in the document.
 * Contains the file global details.
 */
const SerializationHeader = r => {
	logIndent(r);
	ROOT_ID = logKeyValue(r, 'RootId', int32());
	logKeyValue(r, 'HeaderId', int32());
	logKeyValue(r, 'MajorVersion', int32());
	logKeyValue(r, 'MinorVersion', int32());
	logOutdent();
	return r;
};

const BinaryLibrary = r => {
	logIndent(r);
	logKeyValue(r, 'LibraryId', int32());
	logKeyValue(r, 'LibraryName', LengthPrefixedString());
	logOutdent();
	return r;
};

const ClassInfo = parent => {
	const r = { _type: 'ClassInfo' };
	logIndent(r);
	logKeyValue(r, 'ObjectId', ObjectId(parent));
	logKeyValue(r, 'Name', LengthPrefixedString());
	logKeyValue(r, 'MemberCount', int32());
	logKeyValue(r, 'MemberNames', ListOf(LengthPrefixedString, r.MemberCount.value));
	logOutdent();
	return r;
};

const ENUM_BINARY_TYPE = {
	0: 'Primitive',
	1: 'String',
	2: 'Object',
	3: 'SystemClass',
	4: 'Class',
	5: 'ObjectArray',
	6: 'StringArray',
	7: 'PrimitiveArray',
};
const BinaryTypeEnumeration = () => {
	const r = {};
	r._type = 'BinaryTypeEnumeration';
	const byte = int8();
	r.SYMBOL = { ...byte, string: ENUM_BINARY_TYPE[byte.value] };
  logValue(r.SYMBOL);
	if (null == r.SYMBOL.string) throw `BinaryTypeEnumeration#${JSON.stringify(r.SYMBOL)} not implemented.`;
	return r;
};

const ENUM_PRIMITIVE_TYPE = {
	1: 'Boolean',
	2: 'Byte',
	3: 'Char',
	// 4: 'Unused',
	5: 'Decimal',
	6: 'Double',
	7: 'Int16',
	8: 'Int32',
	9: 'Int64',
	10: 'SByte',
	11: 'Single',
	12: 'TimeSpan',
	13: 'DateTime',
	14: 'UInt16',
	15: 'UInt32',
	16: 'UInt64',
	17: 'Null',
	18: 'String',
};
const PrimitiveTypeEnumeration = () => {
	const r = {};
	r._type = 'PrimitiveTypeEnumeration';
	const byte = int8();
	r.SYMBOL = { ...byte, string: ENUM_PRIMITIVE_TYPE[byte.value] };
	logValue(r.SYMBOL);
	if (null == r.SYMBOL.string) throw `PrimitiveTypeEnumeration#${JSON.stringify(r.SYMBOL)} not implemented.`;
	return r;
};

const ClassTypeInfo = () => {
	const r = {};
	r._type = 'ClassTypeInfo';
	logIndent(r);
	logKeyValue(r, 'TypeName', LengthPrefixedString());
	logKeyValue(r, 'LibraryId', int32());
	// TODO: finish tracing LibraryId to matching BinaryLibrary record
	//       (after all are parsed + indexed; a second pass)
	logOutdent();
	return r;
};

const ENUM_ADDITIONAL_INFO = {
	'Primitive': PrimitiveTypeEnumeration,
	'String': null,
	'Object': null,
	'SystemClass': () => {
		const string = LengthPrefixedString();
		logValue(string);
		return string;
	},
	'Class': ClassTypeInfo,
	'ObjectArray': null,
	'StringArray': null,
	'PrimitiveArray': PrimitiveTypeEnumeration,
};
const AdditionalInfo = binaryTypeEnum => {
	const fn = ENUM_ADDITIONAL_INFO[binaryTypeEnum.SYMBOL.string];
	if (undefined === fn) throw `AdditionalInfo#${JSON.stringify(binaryTypeEnum)} not implemented.`;
	return null === fn ? null : fn();
};

const MemberTypeInfo = parent => {
	const r = {};
	r._type = 'MemberTypeInfo';
	logIndent(r);
	const len = parent.ClassInfo.MemberCount.value;
	logListOf(len, r, 'BinaryTypeEnums', BinaryTypeEnumeration);
	logListOf(len, r, 'AdditionalInfos', i =>
		AdditionalInfo(r.BinaryTypeEnums[i]));
	logOutdent();
	return r;
};

/**
 * mapBinaryTypeAndAdditionalInfoToBufferReadFnExec
 */
const mapBinTypeAddInfoToBufRead = (binaryTypeEnums, additionalInfos) => i => {
	let value;
	switch (binaryTypeEnums[i].SYMBOL.string) {
		case 'Primitive':
			const fn = {
				'Boolean': () => {
					const byte = int8();
					byte.value = !!byte.value;
					return byte;
				},
				'Byte': int8,
				'Char': () => String.fromCharCode(int8()),
				// 'Decimal': null,
				'Double': double,
				'Int16': int16,
				'Int32': int32,
				'Int64': int64,
				// 'SByte': null,
				'Single': single,
				// 'TimeSpan': null,
				// 'DateTime': null,
				'UInt16': uint16,
				'UInt32': uint32,
				'UInt64': uint64,
				// TODO: not sure if these are possible or if they have Record wrappers or are not considered Primitive
				// because they have their own entry alternatives to Primitive, such as BinaryObjectString and nullObject
				// 'Null': null,
				// 'String': LengthPrefixedString(),
			}[additionalInfos[i].SYMBOL.string];
			if (null == fn) throw `MemberTypeInfo#${JSON.stringify(additionalInfos[i])} map to deserializer not implemented for Primitive BinaryTypeEnum.`;
			value = fn();
			logValue(value);
			break;

		case 'Class':
		case 'PrimitiveArray':
		case 'String':
		case 'SystemClass':
			value = Record();
			break;

		default:
			// NOTICE: if this is happening, most likely solution is add it to the list in above case
			throw `BinaryTypeEnum#${JSON.stringify(binaryTypeEnums[i])} map to deserializer not implemented`;
	}	
	return value;
};

const _ClassWithMembersAndTypes = (isSystem, r) => {
	logIndent(r);
	r.ClassInfo = ClassInfo(r);
	r.MemberTypeInfo = MemberTypeInfo(r);
	if (!isSystem) logKeyValue(r, 'LibraryId', int32());
	logListOf(r.ClassInfo.MemberCount.value, r, 'MemberReferences',
		mapBinTypeAddInfoToBufRead(
			r.MemberTypeInfo.BinaryTypeEnums,
			r.MemberTypeInfo.AdditionalInfos));
	logOutdent();
	return r;
};
const SystemClassWithMembersAndTypes = r => _ClassWithMembersAndTypes(true, r);
const ClassWithMembersAndTypes = r => _ClassWithMembersAndTypes(false, r);

const ENUM_BINARY_ARRAY_TYPE = {
	0: 'Single',
	1: 'Jagged',
	2: 'Rectangular',
	3: 'SingleOffset',
	4: 'JaggedOffset',
	5: 'RectangularOffset',
};
const BinaryArrayTypeEnumeration = () => {
	const r = {};
	r._type = 'BinaryArrayTypeEnumeration';
	const byte = int8();
	r.SYMBOL = { ...byte, string: ENUM_BINARY_ARRAY_TYPE[byte.value] };
	logValue(r.SYMBOL);
	if (null == r.SYMBOL.string) throw `BinaryArrayTypeEnumeration#${JSON.stringify(r.SYMBOL)} not implemented.`;
	return r;
};

const BinaryArray = () => {
	const r = {};
	r._type = 'BinaryArray';
	logIndent(r);
	logKeyValue(r, 'ObjectId', ObjectId(r));
	assert.isAbove(r.ObjectId.value, 0);
	logKey(r, 'BinaryArrayTypeEnum', BinaryArrayTypeEnumeration);
	logKeyValue(r, 'Rank', int32());
	logListOf(r.Rank.value, r, 'Lengths', ()=>logValue(int32()));
	switch (r.BinaryArrayTypeEnum.SYMBOL.string) {
		case 'SingleOffset':
		case 'JaggedOffset':
		case 'RectangularOffset':
			logListOf(r.Rank.value, r, 'LowerBounds', ()=>logValue(int32()));
			break;
	}
	logKey(r, 'TypeEnum', BinaryTypeEnumeration);
	logKey(r, 'AdditionalTypeInfo', ()=>AdditionalInfo(r.TypeEnum));
	// TODO: will need to be augmented for multi-dimensional arrays
	//       probably something like r.Rank * r.Lengths, but what order?
	// WARNING: hard-coding to the Lenghts[0] is not going to work with other data
	const len = r.Rank.value * r.Lengths[0].value;
	logListOf(len, r, 'MemberReferences',
		mapBinTypeAddInfoToBufRead(
			repeat(len, r.TypeEnum), 
			repeat(len, r.AdditionalTypeInfo)));
	logOutdent();
	return r;
};

const ObjectNull = () => {
	const r = null;
	logValue(r);
	return r;
};

const BinaryObjectString = () => {
	const r = {};
	r._type = 'BinaryObjectString';
	logIndent(r);
	logKeyValue(r, 'ObjectId', ObjectId(r));
	logKeyValue(r, 'Value', LengthPrefixedString());
	logOutdent();
	return r;
};

/**
 * When two objects share the same structure,
 * and only the values differ.
 */
const ClassWithId = r => {
	logIndent(r);
	logKeyValue(r, 'ObjectId', ObjectId(r));
	logKeyValue(r, 'MetadataId', int32());
	const existingObject = ObjectIndex[r.MetadataId.value];
	assert.exists(existingObject);
	Object.assign(r, existingObject);
	const len = existingObject.ClassInfo.MemberCount.value;
	logListOf(len, r, 'MemberReferences', mapBinTypeAddInfoToBufRead(
		existingObject.MemberTypeInfo.BinaryTypeEnums,
		existingObject.MemberTypeInfo.AdditionalInfos));
	logOutdent();
	return r;
};

const ArraySinglePrimitive = r => {
	logIndent(r);
	r.ArrayInfo = {};
	logKey(r, 'ArrayInfo', () => {
		logKeyValue(r.ArrayInfo, 'ObjectId', ObjectId(r));
		logKeyValue(r.ArrayInfo, 'Length', int32());
		return r.ArrayInfo;
	});
	logKey(r, 'PrimitiveTypeEnum', PrimitiveTypeEnumeration);
	const len = r.ArrayInfo.Length.value;
	logListOf(len, r, 'Values', mapBinTypeAddInfoToBufRead(
		repeat(len, { SYMBOL: { string: 'Primitive' } }),
		repeat(len, r.PrimitiveTypeEnum)));
	logOutdent();
	return r;
};

/**
 * EOF reached.
 */
const MessageEnd = r => {
	logIndent(r);
	logOutdent();
};

const Record = () => {
	const r = {};
	r.RecordTypeEnum = int8();
	const fn = {
		0:  SerializationHeader,
		1:  ClassWithId,
		// 2:  SystemClassWithMembers,
		// 3:  ClassWithMembers,
		4:  SystemClassWithMembersAndTypes,
		5:  ClassWithMembersAndTypes,
		6:  BinaryObjectString,
		7:  BinaryArray,
		// 8:  MemberPrimitiveTyped,
		9:  MemberReference,
		10: ObjectNull,
		11: MessageEnd,
		12:	BinaryLibrary,
		// 13: ObjectNullMultiple256,
		// 14: ObjectNullMultiple,
		15: ArraySinglePrimitive,
		// 16: ArraySingleObject,
		// 17: ArraySingleString,
		// 21: MethodCall,
		// 22: MethodReturn,
	}[r.RecordTypeEnum.value];
	r._type = fn.name;
	if (null == fn) throw `RecordTypeEnum#${r.RecordTypeEnum} not implemented.`;
	Object.assign(r, fn(r));
	return r;
};


// begin

const b = fs.readFileSync(INPUT_FILE);
const fileLength = b.length;
let offset = 0;

log(`Binary Serialization Format`);
log(`File: ${INPUT_FILE}\nLength: ${fileLength}\n`);

// file consists of a series of Record types in any order
// except the first one must be a SerializationHeaderRecord
const records = [];
while (offset < fileLength) {
	const record = Record();
	records.push(record);
}

// resolve all outstanding object references
while (FutureObjectIndex.length > 0) {
	const link = FutureObjectIndex.shift();
	link(); // mutates existing records
}


// inspect this value; it should have everything
const RootObject = ObjectIndex[ROOT_ID];
fs.writeFileSync('ir.json', JSON.stringify(RootObject, null, 2));

const serializeObject = o => {
	if (null === o.value)
		return o.value;
	if (undefined !== o.value && 'object' !== typeof o.value)
		return o.value;
	if ('MemberReference' === o._type) o = o.ResolvedObject.data;
	let name, keys, values;
	switch (o._type) {
		case 'SystemClassWithMembersAndTypes':
		case 'ClassWithMembersAndTypes':
			name = `${o.ClassInfo.Name.String.value}#${o.ObjectId ? o.ObjectId.value : o.ClassInfo.ObjectId.value}`;
			keys = o.ClassInfo.MemberNames;
			if (o.MemberReferences) {
					values = o.MemberReferences.map(ref=>
						serializeObject(ref));
			}
			let data = {};
			for (let i=0; i<keys.length; i++) {
				data[keys[i].String.value] = values[i];
			}
			return { [name]: data };

		case 'BinaryArray':
			name = `${o.AdditionalTypeInfo.TypeName.String.value}#${o.ObjectId.value}`;
			if (o.MemberReferences) {
				values = o.MemberReferences.map(ref=>
					serializeObject(ref));
			}
			return { name, values };

		case 'ArraySinglePrimitive':
			return o.Values.map(v=>v.value);

		case 'BinaryObjectString':
			return o.Value.value;

		case 'ObjectNull':
			return null;

		default:
			debugger;
			break;
	}
};

fs.writeFileSync('simple.json', JSON.stringify(serializeObject(RootObject), null, 2));

process.exit(0);