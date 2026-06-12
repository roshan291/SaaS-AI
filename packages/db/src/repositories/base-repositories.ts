// packages/db/src/repositories/BaseRepository.ts

export class BaseRepository<T> {
  constructor(protected model: any) { }

  async create(data: Partial<T>) {
    return this.model.create(data);
  }

  async findById(id: string) {
    return this.model.findById(id);
  }

  async update(id: string, data: Partial<T>) {
    return this.model.findByIdAndUpdate(
      id,
      data,
      { new: true }
    );
  }

  async findAll() {
    return this.model.find();
  }

  async delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}