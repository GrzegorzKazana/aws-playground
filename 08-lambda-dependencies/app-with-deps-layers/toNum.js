module.exports.toNum = function toNum(sth) {
    const number = Number.parseInt(sth, 10);
    return Number.isNaN(number) ? null : { number };
};
