goog.provide('rethinkdb.query.Expression');

goog.provide('rethinkdb.query.JSONExpression');

goog.require('rethinkdb.net');
goog.require('Query');

/**
 * @constructor
 */
rethinkdb.query.Expression = function() {};

/**
 * @param {function()} callback The callback to invoke with the result.
 * @param {rethinkdb.net.Connection} conn The connection to run this expression on.
 */
rethinkdb.query.Expression.prototype.run = function(callback, conn) {
    conn = conn || rethinkdb.net.last_connection;
    conn.run(this, callback);
};
goog.exportProperty(rethinkdb.query.Expression.prototype, 'run',
    rethinkdb.query.Expression.prototype.run);

/**
 * @return {!Term}
 */
rethinkdb.query.Expression.prototype.compile = goog.abstractMethod;

/**
 * @constructor
 * @extends {rethinkdb.query.Expression}
 */
rethinkdb.query.JSONExpression = function(json_value) {
    this.value_ = json_value;
};
goog.inherits(rethinkdb.query.JSONExpression, rethinkdb.query.Expression);

/**
 * @override
 * @return {!Term}
 */
rethinkdb.query.JSONExpression.prototype.compile = function() {
    var term = new Term();
    term.setType(Term.TermType.JSON);
    term.setJsonstring(JSON.stringify(this.value_));
    return term;
};

function makeBinaryConstructor() {
    /**
     * @constructor
     * @extends {rethinkdb.query.Expression}
     */
    return function(left, right) {
        this.left_ = left;
        this.right_ = right;   
    };
}

/**
 * @param {!Builtin.BuiltinType} builtinType
 * @param {Builtin.Comparison=} compareType
 */
function makeBinaryBuiltinCompile(builtinType, compareType) {
    /**
     * @override
     * @return {!Term}
     */
    return function() {
        var term = new Term();
        term.setType(Term.TermType.CALL);

        var call = new Term.Call();
        var builtin = new Builtin();
        builtin.setType(builtinType);
        if (compareType) builtin.setComparison(compareType);
        call.setBuiltin(builtin);
        call.addArgs(this.left_.compile());
        call.addArgs(this.right_.compile());

        term.setCall(call);
        return term;
    }
}

/** 
 * @param {Builtin.Comparison} compareType
 */
function makeCompareCompile(compareType) {
    return makeBinaryBuiltinCompile(Builtin.BuiltinType.COMPARE, compareType);
}

/**
 * @param {string} className
 * @param {Builtin.BuiltinType|Builtin.Comparison} builtinType
 * @param {string} chainName
 * @param {boolean=} comparison
 */
function makeBinary(className, builtinType, chainName, comparison) {

    // Constructor
    var newClass = rethinkdb.query[className] = makeBinaryConstructor();
    goog.inherits(newClass, rethinkdb.query.Expression);

    // Compile method
    newClass.prototype.compile = comparison ? 
        makeCompareCompile(/**@type {Builtin.Comparison} */(builtinType)) :
        makeBinaryBuiltinCompile(/**@type {Builtin.BuiltinType} */(builtinType));

    // Chainable method on Expression
    rethinkdb.query.Expression.prototype[chainName] = function(other) {
        return new newClass(this, other);
    };
}

/**
 * @param {string} className
 * @param {Builtin.Comparison} compareType
 * @param {string} chainName
 */
function makeComparison(className, compareType, chainName) {
    makeBinary(className, compareType, chainName, true);
}

makeBinary('AddExpression', Builtin.BuiltinType.ADD, 'add');
makeBinary('SubtractExpression', Builtin.BuiltinType.SUBTRACT, 'sub');
makeBinary('MultiplyExpression', Builtin.BuiltinType.MULTIPLY, 'mul');
makeBinary('DivideExpression', Builtin.BuiltinType.DIVIDE, 'div');
makeBinary('ModuloExpression', Builtin.BuiltinType.MODULO, 'mod');

makeComparison('EqualsExpression', Builtin.Comparison.EQ, 'eq');
makeComparison('NotEqualsExpression', Builtin.Comparison.NE, 'ne');
makeComparison('LessThanExpression', Builtin.Comparison.LT, 'lt');
makeComparison('LessThanOrEqualsExpression', Builtin.Comparison.LE, 'le');
makeComparison('GreaterThanExpression', Builtin.Comparison.GT, 'gt');
makeComparison('GreaterThanOrEqualsExpression', Builtin.Comparison.GE, 'ge');

/**
 * @return {rethinkdb.query.Expression}
 * @param {*} start_key
 * @param {*} end_key
 * @param {boolean=} start_inclusive 
 * @param {boolean=} end_inclusive 
 */
rethinkdb.query.Expression.prototype.between =
        function(start_key, end_key, start_inclusive, end_inclusive) {
    return new rethinkdb.query.RangeExpression(this,
                                               start_key,
                                               end_key,
                                               start_inclusive,
                                               end_inclusive);
};
goog.exportProperty(rethinkdb.query.Expression.prototype, 'between',
                    rethinkdb.query.Expression.prototype.between);

/**
 * @constructor
 * @extends {rethinkdb.query.Expression}
 */
rethinkdb.query.RangeExpression = function(leftExpr,
                                           start_key,
                                           end_key,
                                           start_inclusive,
                                           end_inclusive) {
    this.leftExpr_ = leftExpr;
    this.startKey_ = start_key;
    this.endKey_ = end_key;
    this.startInclusive_ = (typeof start_inclusive === 'undefined') ?
                                false : start_inclusive;
    this.endInclusive_ = (typeof end_inclusive === 'undefined') ?
                                false : end_inclusive;
};

rethinkdb.query.RangeExpression.prototype.compile = function() {
    var term = new Term();
    term.setType(Term.TermType.CALL);

    var call = new Term.Call();
    var builtin = new Builtin();
    builtin.setType(Builtin.BuiltinType.RANGE);

    var range = new Builtin.Range();
    range.setAttrname('id');
    range.setLowerbound(/*TODO ?*/ new Term());
    range.setUpperbound(/*TODO ?*/ new Term());
    builtin.setRange(range);

    call.setBuiltin(builtin);
    term.setCall(call);
    return term;
};

/**
 * @constructor
 * @extends {rethinkdb.query.Expression}
 * @param {rethinkdb.query.Expression} leftExpr
 * @param {number} leftExtent
 * @param {number=} opt_rightExtent
 */
rethinkdb.query.SliceExpression = function(leftExpr, leftExtent, opt_rightExtent) {
    this.leftExpr_ = leftExpr;
    this.leftExtent_ = leftExtent;
    this.rightExtent_ = opt_rightExtent || null;
};

rethinkdb.query.SliceExpression.prototype.compile = function() {
    var term = new Term();
    term.setType(Term.TermType.CALL);

    var call = new Term.Call();
    var builtin = new Builtin();
    builtin.setType(Builtin.BuiltinType.SLICE);
    call.setBuiltin(builtin);

    call.addArgs(this.leftExpr_.compile());

    var leftExtent = new Term();
    leftExtent.setType(Term.TermType.NUMBER);
    leftExtent.setNumber(this.leftExtent_);
    call.addArgs(leftExtent);

    var rightExtent = new Term();
    if (this.rightExtent_ !== null) {
        rightExtent.setType(Term.TermType.NUMBER);
        rightExtent.setNumber(/**@type {number}*/this.rightExtent_);
    } else {
        rightExtent.setType(Term.TermType.JSON_NULL);
    }
    call.addArgs(rightExtent);

    term.setCall(call);

    return term;
};

/**
 * @return {rethinkdb.query.Expression}
 */
rethinkdb.query.Expression.prototype.slice = function(startIndex, opt_endIndex) {
    return new rethinkdb.query.SliceExpression(this, startIndex, opt_endIndex);
};
goog.exportProperty(rethinkdb.query.Expression.prototype, 'slice',
    rethinkdb.query.Expression.prototype.slice);

/**
 * @return {rethinkdb.query.Expression}
 */
rethinkdb.query.Expression.prototype.limit = function(endIndex) {
    return new rethinkdb.query.SliceExpression(this, 0, endIndex);
};
goog.exportProperty(rethinkdb.query.Expression.prototype, 'limit',
    rethinkdb.query.Expression.prototype.limit);

/**
 * @constructor
 * @extends {rethinkdb.query.Expression}
 * @param {rethinkdb.query.Expression} leftExpr
 * @param {number} index
 */
rethinkdb.query.NthExpression = function(leftExpr, index) {
    this.leftExpr_ = leftExpr;
    this.index_ = index;
};

rethinkdb.query.NthExpression.prototype.compile = function() {
    var term = new Term();
    term.setType(Term.TermType.CALL);

    var call = new Term.Call();
    var builtin = new Builtin();
    builtin.setType(Builtin.BuiltinType.ARRAYNTH);
    call.setBuiltin(builtin);

    call.addArgs(this.leftExpr_.compile());

    var index = new Term();
    index.setType(Term.TermType.NUMBER);
    index.setNumber(this.index_);
    call.addArgs(index);

    term.setCall(call);

    return term;
};

/**
 * @return {rethinkdb.query.Expression}
 */
rethinkdb.query.Expression.prototype.nth = function(index) {
    return new rethinkdb.query.NthExpression(this, index);
};
goog.exportProperty(rethinkdb.query.Expression.prototype, 'nth',
    rethinkdb.query.Expression.prototype.nth);

/**
 * @return {rethinkdb.query.Expression}
 */
rethinkdb.query.Expression.prototype.filter = function(selector) {

};
